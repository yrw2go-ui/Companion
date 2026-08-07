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
  { id: 'bytedance/seedance-2.5/image-to-video', label: 'Seedance 2.5 I2V (4-30s, audio) 🔊', price: null },
]

// text-to-video options
const T2V_MODELS = [
  { id: 'xai/grok-imagine-video/text-to-video', label: 'Grok Imagine', price: null },
  { id: 'kwaivgi/kling-v3.0-pro/text-to-video', label: 'Kling V3.0 Pro (sound, 3-15s)', price: null },
  { id: 'kwaivgi/kling-video-o3-pro/text-to-video', label: 'Kling O3 Pro (sound, 3-15s)', price: null },
  { id: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 T2V (4-30s, audio) 🔊', price: null },
]
const T2V_MODEL = T2V_MODELS[0].id
const T2V_PRICE = null

// video-edit (existing video in, edited video out)
const VIDEO_EDIT_MODEL = 'kwaivgi/kling-video-o3-pro/video-edit'

const IMAGE_MODELS = [
  // maxRefs = optional reference images (capped at 4 in UI / payload)
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream', price: null, maxRefs: 4 },
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux', price: null, maxRefs: 4 },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux', price: null, maxRefs: 4 },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell', price: null, maxRefs: 4 },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok', price: { '1k': 0.05, '2k': 0.07 }, maxRefs: 1 },
]
const imgFamilyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family
const createMaxRefs = (modelId) => {
  const n = (IMAGE_MODELS.find(m => m.id === modelId) || IMAGE_MODELS[0]).maxRefs || 0
  return Math.max(0, Math.min(4, n))
}

// Same style list as cards — appended to the end of the prompt on create
const ART_STYLES = [
  { value: '', label: 'None (use prompt as-is)' },
  { value: 'Fortnite style 3D character render, Epic Games Fortnite aesthetic, stylized cartoony proportions, clean cel-shaded look, bold outlines, vibrant saturated colors, simplified facial features, game character art, not photorealistic, not realistic skin, Unreal Engine game render style', label: 'Fortnite Style (non-realistic)' },
  { value: 'stylized 3D game character, anime-influenced proportions, smooth plastic skin shader, bright saturated palette, clean game-ready render, not photorealistic', label: 'Stylized 3D Game Character' },
  { value: 'anime illustration, clean line art, cel shading, vibrant colors, detailed eyes, not photorealistic, 2D anime style', label: 'Anime Illustration' },
  { value: 'comic book illustration, bold ink outlines, flat color fills, dynamic pose, graphic novel style, not photorealistic', label: 'Comic Book' },
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
const withStyle = (base, style) => (!style ? base : `${base}, ${style}`)
const STYLIZED_NEG =
  'photorealistic, photo, real human, realistic skin pores, DSLR photo, 8k photo, hyperrealistic, uncanny valley'
const isStylizedArt = (style) =>
  /fortnite|stylized|anime|comic book|not photorealistic|cel-?shad/i.test(String(style || ''))

// Same prompt extras as card creation — click chips to add/remove in fixed order
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

// image-to-image (transform) models
// maxRefs = total images including the main source (1 = single only, 4 = main + 3 extras)
// sizeMode: 'pixel' → send size "W*H" | 'aspect' → send aspectRatio + resolution
const I2I_SIZES_PIXEL = [
  { value: '768*1024', label: 'Portrait 3:4 (768×1024)' },
  { value: '1024*768', label: 'Landscape 4:3 (1024×768)' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
  { value: '1024*576', label: 'Wide 16:9' },
]
const I2I_SIZES_SEEDREAM = [
  { value: '1328*1776', label: 'Portrait ~3:4 hi-res (1328×1776)' },
  { value: '1776*1328', label: 'Landscape ~4:3 hi-res' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '1440*2560', label: 'Tall 9:16 hi-res' },
  { value: '2560*1440', label: 'Wide 16:9 hi-res' },
  { value: '768*1024', label: 'Portrait 3:4' },
]
const I2I_SIZES_GROK = [
  { value: '2:3|2k', label: 'Portrait 2:3 · 2K' },
  { value: '3:2|2k', label: 'Landscape 3:2 · 2K' },
  { value: '1:1|2k', label: 'Square 1:1 · 2K' },
  { value: '9:16|2k', label: 'Tall 9:16 · 2K' },
  { value: '16:9|2k', label: 'Wide 16:9 · 2K' },
  { value: '2:3|1k', label: 'Portrait 2:3 · 1K' },
  { value: '1:1|1k', label: 'Square 1:1 · 1K' },
]
const I2I_MODELS = [
  {
    id: 'alibaba/wan-2.7-pro/image-edit',
    label: 'Wan 2.7 Pro (edit)',
    price: null,
    maxRefs: 4,
    sizeMode: 'pixel',
    sizes: I2I_SIZES_PIXEL,
    defaultSize: '768*1024',
  },
  {
    id: 'bytedance/seedream-v5.0-pro/edit',
    label: 'Seedream 5 Pro (edit)',
    price: null,
    maxRefs: 4,
    sizeMode: 'pixel',
    sizes: I2I_SIZES_SEEDREAM,
    defaultSize: '1328*1776',
  },
  {
    id: 'xai/grok-imagine-image-quality/edit',
    label: 'Grok Imagine (edit)',
    price: 0.01,
    maxRefs: 1,
    sizeMode: 'aspect',
    sizes: I2I_SIZES_GROK,
    defaultSize: '2:3|2k',
  },
]
const i2iModelOf = (modelId) => I2I_MODELS.find(m => m.id === modelId) || I2I_MODELS[0]
const i2iMaxRefs = (modelId) => i2iModelOf(modelId).maxRefs || 1
const i2iSizesOf = (modelId) => i2iModelOf(modelId).sizes || I2I_SIZES_PIXEL
const i2iDefaultSize = (modelId) => i2iModelOf(modelId).defaultSize || i2iSizesOf(modelId)[0]?.value

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
  // Folder sort: alpha (default A-Z) | recent | size — second click inverts
  // Recent = last media filed into folder OR last time you opened the folder
  const [folderSort, setFolderSort] = useState('alpha')
  const [folderSortAsc, setFolderSortAsc] = useState(true)
  const [folderActivity, setFolderActivity] = useState({}) // folder_id -> last media filed timestamp (ms)
  const [folderAccessed, setFolderAccessed] = useState(() => {
    try {
      const raw = localStorage.getItem('ga_folder_accessed')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }) // folder_id -> last opened (ms)
  const downloadCounter = useRef(0)
  // Prefetch blob when detail opens so Download stays in a real user-gesture (Android)
  const prefetchBlobRef = useRef(null) // { url, blob, mime }
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
  const [createRefs, setCreateRefs] = useState([]) // optional reference images
  const [pickCreateRef, setPickCreateRef] = useState(null) // 'next' | index

  const [showVideo, setShowVideo] = useState(false)
  const [videoSource, setVideoSource] = useState('')
  const [videoPrompt, setVideoPrompt] = useState('smooth natural motion, eyes blinking naturally')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoRes, setVideoRes] = useState('720p')
  const [videoModel, setVideoModel] = useState('alibaba/wan-2.6/image-to-video')
  const [highNoiseLoras, setHighNoiseLoras] = useState('')
  const [lowNoiseLoras, setLowNoiseLoras] = useState('')

  const SEEDREAM_DEFAULT = (IMAGE_MODELS.find(m => m.family === 'seedream') || IMAGE_MODELS[0]).id
  const [createModel, setCreateModel] = useState(SEEDREAM_DEFAULT)
  const [artStylesList, setArtStylesList] = useState(ART_STYLES)
  const [createArtStyle, setCreateArtStyle] = useState(
    (ART_STYLES.find(s => /fortnite/i.test(s.label)) || ART_STYLES[1]).value
  )
  const [promptExtraCategories, setPromptExtraCategories] = useState(PROMPT_EXTRA_CATEGORIES)
  const [promptExtras, setPromptExtras] = useState({})
  const [customChipCat, setCustomChipCat] = useState('')
  const [customChipLabel, setCustomChipLabel] = useState('')
  const [customChipText, setCustomChipText] = useState('')
  const [customChipSaving, setCustomChipSaving] = useState(false)
  const [cardTextOn, setCardTextOn] = useState(false)
  const [cardTextContent, setCardTextContent] = useState('')
  const [cardTextSize, setCardTextSize] = useState('medium')
  const [cardTextPos, setCardTextPos] = useState('bottom')
  const [cardTextFont, setCardTextFont] = useState('sans')
  const [cardTextColor, setCardTextColor] = useState('white')

  const [showTransform, setShowTransform] = useState(false)
  const [transformSource, setTransformSource] = useState(null)
  // Extra refs beyond the main image (slots 2–4). Length capped by model maxRefs − 1.
  const [transformRefs, setTransformRefs] = useState([]) // array of gallery items or { url }
  const [transformPrompt, setTransformPrompt] = useState('')
  const [transformModel, setTransformModel] = useState('bytedance/seedream-v5.0-pro/edit')
  const [transformSize, setTransformSize] = useState(() => i2iDefaultSize('bytedance/seedream-v5.0-pro/edit'))
  const [transforming, setTransforming] = useState(false)
  const [pickRefSlot, setPickRefSlot] = useState(null) // index into transformRefs to fill, or 'next'


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
  const [miscOverlayName, setMiscOverlayName] = useState('')
  const [miscOverlayFont, setMiscOverlayFont] = useState('impact')
  const [miscOverlayPos, setMiscOverlayPos] = useState('h-top-left')
  const [miscOverlaySize, setMiscOverlaySize] = useState('md')
  const [showFreebieModal, setShowFreebieModal] = useState(false)

  const NAME_FONTS = [
    { id: 'impact', label: 'Impact Bold', family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', weight: 900 },
    { id: 'arialblack', label: 'Arial Black', family: '"Arial Black", "Helvetica Neue", sans-serif', weight: 900 },
    { id: 'georgia', label: 'Georgia Bold', family: 'Georgia, "Times New Roman", serif', weight: 700 },
    { id: 'system', label: 'System ExtraBold', family: 'system-ui, -apple-system, sans-serif', weight: 800 },
    { id: 'mono', label: 'Mono Bold', family: 'ui-monospace, "Courier New", monospace', weight: 700 },
  ]
  const NAME_POSITIONS = [
    { id: 'h-top-left', label: 'Horizontal · top left' },
    { id: 'h-top-center', label: 'Horizontal · top middle' },
    { id: 'h-top-right', label: 'Horizontal · top right' },
    { id: 'h-bottom-left', label: 'Horizontal · bottom left' },
    { id: 'h-bottom-center', label: 'Horizontal · bottom middle' },
    { id: 'h-bottom-right', label: 'Horizontal · bottom right' },
    { id: 'v-upper-left', label: 'Vertical · upper left side' },
    { id: 'v-mid-left', label: 'Vertical · left side middle' },
    { id: 'v-upper-right', label: 'Vertical · upper right side' },
    { id: 'v-mid-right', label: 'Vertical · right side middle' },
  ]
  const NAME_SIZES = [
    { id: 'md', label: 'Default' },
    { id: 'lg', label: 'Large' },
    { id: 'xl', label: 'Extra large' },
    { id: 'xxl', label: 'Huge' },
  ]
  const OVERLAY_SIZE_PX = { md: '0.85rem', lg: '1.1rem', xl: '1.35rem', xxl: '1.65rem' }
  const [freebieTitle, setFreebieTitle] = useState('')
  const [freebieType, setFreebieType] = useState('media') // media | tokens
  const [freebieTokens, setFreebieTokens] = useState('100')
  const [freebieMax, setFreebieMax] = useState('50')
  const [freebieBusy, setFreebieBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const fileInputRef = useRef(null)
  const [fetchingOrphans, setFetchingOrphans] = useState(false)
  const [fetchOrphanStatus, setFetchOrphanStatus] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetStatus, setResetStatus] = useState('')

  useEffect(() => {
    load().then(() => flushPendingGallerySaves().catch(() => {}))
    ;(async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('art_styles, default_art_style, prompt_extra_categories')
          .eq('id', 1)
          .maybeSingle()
        const styles = Array.isArray(data?.art_styles) && data.art_styles.length
          ? data.art_styles.map(s => ({ label: String(s.label || ''), value: String(s.value ?? '') }))
          : ART_STYLES
        setArtStylesList(styles)
        const def = data?.default_art_style
        if (def != null && styles.some(s => s.value === def)) setCreateArtStyle(def)
        else {
          const ft = styles.find(s => /fortnite/i.test(s.label))
          if (ft) setCreateArtStyle(ft.value)
        }
        if (Array.isArray(data?.prompt_extra_categories) && data.prompt_extra_categories.length) {
          setPromptExtraCategories(data.prompt_extra_categories)
        }
      } catch (e) {
        console.warn('art styles load', e)
      }
    })()
  }, [])

  // Keep editPrompt in sync when opening a detail item
  useEffect(() => {
    if (selected?.source === 'gallery_media') {
      setEditPrompt(selected.prompt || '')
    } else {
      setEditPrompt('')
    }
  }, [selected?.key, selected?.id, selected?.prompt])

  // Prefetch file bytes when detail opens — fixes "download only works after refresh"
  // (Android Chrome drops <a download> if click happens after await fetch)
  useEffect(() => {
    let cancelled = false
    prefetchBlobRef.current = null
    const url = selected?.url
    if (!url) return undefined
    ;(async () => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const buf = await res.arrayBuffer()
        if (cancelled) return
        const urlLow = String(url).toLowerCase()
        let mime = res.headers.get('content-type') || ''
        if (!mime || mime === 'application/octet-stream') {
          if (urlLow.includes('.png')) mime = 'image/png'
          else if (urlLow.includes('.webp')) mime = 'image/webp'
          else if (urlLow.includes('.gif')) mime = 'image/gif'
          else if (urlLow.includes('.mp4')) mime = 'video/mp4'
          else if (urlLow.includes('.webm')) mime = 'video/webm'
          else if (urlLow.includes('.jpg') || urlLow.includes('.jpeg')) mime = 'image/jpeg'
          else if (selected?.type === 'video') mime = 'video/mp4'
          else mime = 'image/jpeg'
        }
        prefetchBlobRef.current = { url, blob: new Blob([buf], { type: mime }), mime }
      } catch (err) {
        console.warn('prefetch download blob', err)
      }
    })()
    return () => { cancelled = true }
  }, [selected?.url, selected?.key, selected?.id])

  // Same combined Reset All as Settings (keeps essential folders empty)
  const ESSENTIAL_FOLDER_NAMES = ['main banner', '+media', 'misc beauties']
  const isEssentialFolder = (name) =>
    ESSENTIAL_FOLDER_NAMES.includes(String(name || '').trim().toLowerCase())

  const ensureEssentialFolders = async () => {
    const wanted = [{ name: 'Main Banner' }, { name: '+media' }, { name: 'Misc Beauties' }]
    const { data: existing } = await supabase.from('gallery_folders').select('id, name')
    const have = new Set((existing || []).map(f => String(f.name || '').trim().toLowerCase()))
    for (const w of wanted) {
      if (!have.has(w.name.toLowerCase())) {
        await supabase.from('gallery_folders').insert([{ name: w.name }])
      }
    }
  }

  const runResetAll = async () => {
    if (resetting) return
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      alert('Type RESET to confirm')
      return
    }
    setResetting(true)
    setResetStatus('Clearing folder contents...')
    try {
      await supabase.from('folder_items').delete().neq('item_key', '__never__')

      setResetStatus('Deleting gallery media...')
      await supabase.from('gallery_media').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Deleting chat images/videos...')
      await supabase.from('messages').delete().in('role', ['image', 'video'])

      setResetStatus('Deleting game media & ownership...')
      try { await supabase.from('player_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}
      try { await supabase.from('player_media').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}
      try { await supabase.from('player_misc').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}
      try { await supabase.from('character_media').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}
      try { await supabase.from('misc_items').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}
      try { await supabase.from('freebies').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch {}

      setResetStatus('Deleting cards...')
      await supabase.from('cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Deleting characters...')
      await supabase.from('characters').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Pruning non-essential folders...')
      const { data: allFolders } = await supabase.from('gallery_folders').select('id, name')
      for (const f of allFolders || []) {
        if (!isEssentialFolder(f.name)) {
          await supabase.from('gallery_folders').delete().eq('id', f.id)
        }
      }
      await ensureEssentialFolders()

      setResetStatus('Wiping storage files...')
      const storageRes = await fetch('/api/empty-storage', { method: 'POST' })
      const storageData = await storageRes.json()
      if (storageData.error) throw new Error('Storage wipe failed: ' + storageData.error)

      setShowResetModal(false)
      setResetConfirmText('')
      setResetStatus('')
      alert(
        `Reset complete. Removed ${storageData.deleted ?? '?'} storage file(s).\n` +
        'Kept empty folders: Main Banner, +media, Misc Beauties.'
      )
      setSelected(null)
      await load()
    } catch (err) {
      alert('Reset failed: ' + err.message)
      setResetStatus('')
    }
    setResetting(false)
  }

  // Same as Settings → Import Orphaned Media (scan + import)
  const fetchOrphansIntoGallery = async () => {
    if (fetchingOrphans) return
    setFetchingOrphans(true)
    setFetchOrphanStatus('Scanning storage for orphans…')
    try {
      const scanRes = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const scan = await scanRes.json()
      if (scan.error) throw new Error(scan.error)
      const count = scan.orphanCount || 0
      if (!count) {
        setFetchOrphanStatus('No orphaned files found')
        setTimeout(() => setFetchOrphanStatus(''), 2500)
        setFetchingOrphans(false)
        return
      }
      if (!confirm(`Found ${count} orphaned file(s) in storage.\n\nImport them into Gallery?`)) {
        setFetchOrphanStatus('')
        setFetchingOrphans(false)
        return
      }
      setFetchOrphanStatus(`Importing ${count} file(s)…`)
      const impRes = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, mode: 'import' }),
      })
      const imp = await impRes.json()
      if (imp.error) throw new Error(imp.error)
      setFetchOrphanStatus(`Imported ${imp.imported ?? count} file(s)`)
      await load()
      setTimeout(() => setFetchOrphanStatus(''), 3000)
    } catch (err) {
      setFetchOrphanStatus('Error: ' + err.message)
      alert('Fetch orphans failed: ' + err.message)
    }
    setFetchingOrphans(false)
  }

  // Upload local image/video files straight into Gallery (storage + gallery_media row)
  const uploadFilesToGallery = async (fileList) => {
    const files = Array.from(fileList || []).filter(f =>
      (f.type || '').startsWith('image/') || (f.type || '').startsWith('video/')
    )
    if (!files.length) {
      alert('Pick image or video files only')
      return
    }
    setUploading(true)
    let ok = 0
    let fail = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`)
      try {
        const isVideo = (file.type || '').startsWith('video/')
        const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '')
        const fileName = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || (isVideo ? 'mp4' : 'jpg')}`
        const { error: upErr } = await supabase.storage
          .from('character-images')
          .upload(fileName, file, {
            contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
            upsert: false,
          })
        if (upErr) throw new Error(upErr.message)
        const { data: pub } = supabase.storage.from('character-images').getPublicUrl(fileName)
        const url = pub?.publicUrl
        if (!url) throw new Error('No public URL')

        let poster_url = null
        if (isVideo) {
          try {
            poster_url = await ensurePosterUrl(url)
          } catch (e) {
            console.warn('poster', e)
          }
        }

        const row = {
          type: isVideo ? 'video' : 'image',
          url,
          prompt: file.name,
          model: 'upload',
          poster_url: poster_url || undefined,
        }
        const saved = await saveWithRetry(row, file.name)
        if (saved) {
          ok++
          // optional: file into active folder if one is selected
          if (activeFolder && activeFolder !== 'all' && activeFolder !== 'unfiled' && saved.id) {
            const key = 'gal_' + saved.id
            await supabase.from('folder_items').upsert(
              { source: 'gallery_media', item_key: key, folder_id: activeFolder },
              { onConflict: 'source,item_key' }
            )
            setFolderMap(prev => ({ ...prev, [key]: activeFolder }))
            setFolderActivity(prev => ({ ...prev, [activeFolder]: Date.now() }))
          }
        } else {
          fail++
        }
      } catch (err) {
        console.error(err)
        fail++
        alert(`Failed: ${file.name}\n${err.message}`)
      }
    }
    setUploading(false)
    setUploadStatus('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()
    if (ok || fail) {
      alert(`Upload done: ${ok} saved${fail ? `, ${fail} failed` : ''}`)
    }
  }

  // Pending gallery_media saves survive refresh / app close (shared key with cards page)
  const PENDING_KEY = 'ga_pending_media_saves'
  const readPending = () => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') } catch { return [] }
  }
  const writePending = (list) => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list || [])) } catch {}
  }
  const enqueuePendingGallery = (row, label) => {
    const list = readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === row?.url))
    list.push({
      id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      table: 'gallery_media',
      row,
      label: label || 'media',
      attempts: 0,
    })
    writePending(list)
  }

  // Server register first (service role / API) so prompt+url land even if the tab dies next.
  const registerGalleryOnServer = async (row) => {
    if (!row?.url) return null
    try {
      const res = await fetch('/api/register-gallery-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
        keepalive: true,
      })
      const data = await res.json().catch(() => ({}))
      const hit = data?.results?.find?.(r => r.ok && r.row) || null
      if (hit?.row) return hit.row
      if (data?.results?.[0]?.row) return data.results[0].row
      return null
    } catch (e) {
      console.warn('register-gallery-media failed', e)
      return null
    }
  }

  // saves a completed generation to gallery_media with up to 10 retries.
  // Atlas already uploaded the file; this only writes the DB row so it appears in Gallery.
  // On total failure, queues to localStorage and retries on next load/refresh.
  // quiet: true = no alerts (used by background flush)
  const saveWithRetry = async (row, label, quiet = false) => {
    if (!row?.url) {
      if (!quiet) alert(`${label || 'File'} has no URL — nothing to save`)
      return null
    }

    // Queue immediately so a mid-save app switch still has prompt/url for resume flush
    enqueuePendingGallery(row, label)

    // Prefer server insert (keeps prompt/model/seed; survives background better)
    const serverRow = await registerGalleryOnServer(row)
    if (serverRow?.id) {
      const entry = {
        ...serverRow,
        key: 'gal_' + serverRow.id,
        source: 'gallery_media',
        created_at: serverRow.created_at || new Date().toISOString(),
      }
      setMedia(prev => {
        const rest = (prev || []).filter(x => x.url !== serverRow.url && x.id !== serverRow.id)
        return [entry, ...rest]
      })
      writePending(readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === row.url)))
      return serverRow
    }

    // If this URL is already in gallery_media, don't insert a duplicate (return existing)
    try {
      const { data: existing } = await supabase
        .from('gallery_media')
        .select('*')
        .eq('url', row.url)
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        const entry = {
          ...existing,
          key: 'gal_' + existing.id,
          source: 'gallery_media',
          created_at: existing.created_at || new Date().toISOString(),
        }
        setMedia(prev => {
          const rest = (prev || []).filter(x => x.url !== existing.url && x.id !== existing.id)
          return [entry, ...rest]
        })
        // clear any pending for this url
        writePending(readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === row.url)))
        return existing
      }
    } catch (e) {
      console.warn('dedupe check failed', e)
    }

    // drop undefined/null optional fields that can trip strict schemas
    const clean = {}
    for (const [k, v] of Object.entries(row || {})) {
      if (v !== undefined && v !== null && v !== '') clean[k] = v
    }
    clean.url = row.url
    clean.type = row.type || 'image'

    // Progressive payloads: full → core → bare minimum (survives schema/RLS quirks)
    const payloads = [
      clean,
      {
        type: clean.type,
        url: clean.url,
        prompt: clean.prompt || null,
        model: clean.model || null,
        poster_url: clean.poster_url || null,
        seed: clean.seed ?? null,
        size: clean.size || null,
        negative_prompt: clean.negative_prompt || null,
        source_prompt: clean.source_prompt || null,
      },
      { type: clean.type, url: clean.url, prompt: clean.prompt || label || null },
      { type: clean.type, url: clean.url },
    ]

    let lastErr = null
    let attempt = 0
    const maxAttempts = 10
    while (attempt < maxAttempts) {
      for (const payload of payloads) {
        if (attempt >= maxAttempts) break
        const body = {}
        for (const [k, v] of Object.entries(payload)) {
          if (v !== undefined && v !== null && v !== '') body[k] = v
        }
        body.url = clean.url
        body.type = clean.type

        const { data, error } = await supabase
          .from('gallery_media')
          .insert([body])
          .select()
          .single()
        attempt++
        if (!error && data) {
          const entry = {
            ...data,
            key: 'gal_' + data.id,
            source: 'gallery_media',
            created_at: data.created_at || new Date().toISOString(),
          }
          setMedia(prev => {
            const rest = (prev || []).filter(x => x.url !== data.url && x.id !== data.id)
            return [entry, ...rest]
          })
          writePending(readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === clean.url)))
          return data
        }
        lastErr = error
        console.error('gallery_media insert attempt', attempt, error)
        if (error && /duplicate|unique/i.test(error.message || '')) {
          const { data: again } = await supabase.from('gallery_media').select('*').eq('url', clean.url).limit(1).maybeSingle()
          if (again) {
            writePending(readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === clean.url)))
            return again
          }
        }
        await new Promise(r => setTimeout(r, Math.min(4000, 300 * attempt)))
      }
    }

    // Last resort: ask server import-orphans to pick up this URL
    try {
      const impRes = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, mode: 'import', forceUrls: [clean.url] }),
      })
      const imp = await impRes.json().catch(() => ({}))
      if (imp?.imported > 0 || imp?.ok) {
        await load()
        const { data: rescued } = await supabase.from('gallery_media').select('*').eq('url', clean.url).limit(1).maybeSingle()
        if (rescued) {
          writePending(readPending().filter(p => !(p.table === 'gallery_media' && p.row?.url === clean.url)))
          return rescued
        }
      }
    } catch (e) {
      console.warn('orphan rescue failed', e)
    }

    // Queue for retry after refresh / reopen
    enqueuePendingGallery(clean, label)
    if (!quiet) {
      const detail = lastErr?.message || lastErr?.code || 'unknown error'
      alert(
        `${label} was created in storage, but the gallery row failed after 10 tries.\n\n` +
        `Error: ${detail}\n\n` +
        `Queued to auto-retry when you reopen Gallery.\n` +
        `Direct link (not lost):\n${row.url}`
      )
    }
    return null
  }

  const flushPendingGallerySaves = async () => {
    const list = readPending().filter(p => p.table === 'gallery_media')
    if (!list.length) return
    let remaining = readPending().filter(p => p.table !== 'gallery_media')
    let rescued = 0
    for (const item of list) {
      if ((item.attempts || 0) >= 15) {
        remaining.push(item)
        continue
      }
      try {
        const saved = await saveWithRetry(item.row, item.label || 'Queued media', true)
        if (saved) rescued++
        else remaining.push({ ...item, attempts: (item.attempts || 0) + 1 })
      } catch {
        remaining.push({ ...item, attempts: (item.attempts || 0) + 1 })
      }
    }
    writePending(remaining)
    if (rescued > 0) await load()
  }

  // Leave app → beacon pending rows to server. Return → flush + reload.
  useEffect(() => {
    const onHide = () => {
      const list = readPending().filter(p => p.table === 'gallery_media' && p.row?.url)
      if (!list.length) return
      try {
        const payload = JSON.stringify({ items: list.map(p => p.row) })
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' })
          navigator.sendBeacon('/api/register-gallery-media', blob)
        } else {
          fetch('/api/register-gallery-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {})
        }
      } catch (e) {
        console.warn('beacon pending failed', e)
      }
    }
    const onShow = () => {
      flushPendingGallerySaves()
        .then(() => load())
        .catch(() => {})
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide()
      else onShow()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [])

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
    const activity = {} // max created_at per folder (media added / filed)
    for (const fi of folderItemRows) {
      fmap[fi.item_key] = fi.folder_id
      if (!fi.folder_id) continue
      const ts = new Date(fi.created_at || fi.updated_at || 0).getTime()
      if (!activity[fi.folder_id] || ts > activity[fi.folder_id]) activity[fi.folder_id] = ts
    }
    setFolderMap(fmap)
    setFolderActivity(activity)

    const cardRows = await fetchAllRows(
      'cards',
      'id, name, card_number, image_url, back_image_url, video_url, image_prompt, back_image_prompt, video_prompt, seed, back_seed, created_at, published, poster_url',
      q => q.order('created_at', { ascending: false })
    )

    const { data: mSets } = await supabase.from('misc_sets').select('*').order('name')
    setMiscSets(mSets || [])

    const charMediaRows = await fetchAllRows(
      'character_media',
      'id, character_name, type, url, title, published, card_id',
      q => q.order('created_at', { ascending: false })
    )
    const miscItemRows = await fetchAllRows(
      'misc_items',
      'id, public_id, type, url, title, published, sort_index, set_id',
      q => q.order('created_at', { ascending: false })
    )
    const miscSetById = {}
    for (const s of mSets || []) miscSetById[s.id] = s

    const publishedLinkMap = {}
    const addPub = (url, label) => {
      if (!url) return
      const u = String(url)
      if (!publishedLinkMap[u]) publishedLinkMap[u] = []
      if (!publishedLinkMap[u].includes(label)) publishedLinkMap[u].push(label)
    }
    for (const c of cardRows || []) {
      if (!c.published) continue
      const label = (`Card ${c.card_number || ''} ${c.name || ''}`).trim()
      addPub(c.image_url, label + ' (front)')
      addPub(c.back_image_url, label + ' (back)')
      addPub(c.video_url, label + ' (video)')
      addPub(c.poster_url, label + ' (poster)')
    }
    // All character/+media links (published or not) — warn on delete
    const charMediaByUrl = {}
    for (const m of charMediaRows || []) {
      if (!m.url) continue
      if (!charMediaByUrl[m.url]) charMediaByUrl[m.url] = []
      charMediaByUrl[m.url].push(m)
      const who = m.character_name || m.title || 'character'
      if (m.published) {
        addPub(m.url, `Media · ${who} (LIVE)`)
      } else {
        addPub(m.url, `Card +media · ${who}`)
      }
    }
    for (const m of miscItemRows || []) {
      if (m.published === false) continue
      const set = m.set_id ? miscSetById[m.set_id] : null
      const setPart = set ? ` · ${set.name}` : ' · Standalone'
      addPub(m.url, (`Misc Beauties ${m.public_id || ''}${setPart}`).trim())
    }

    // Live freebies (media)
    const { data: freebieRows } = await supabase
      .from('freebies')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    for (const fb of freebieRows || []) {
      if (fb.type === 'media' && fb.media_url) {
        const left = Math.max(0, (fb.max_redemptions || 0) - (fb.redemption_count || 0))
        addPub(fb.media_url, left > 0 ? 'Freebie · LIVE' : 'Freebie · sold out')
      }
    }

    // url -> misc_items rows (for remove)
    const miscByUrl = {}
    for (const m of miscItemRows || []) {
      if (!m.url) continue
      if (!miscByUrl[m.url]) miscByUrl[m.url] = []
      miscByUrl[m.url].push(m)
    }
    const freebieByUrl = {}
    for (const fb of freebieRows || []) {
      if (fb.type !== 'media' || !fb.media_url) continue
      if (!freebieByUrl[fb.media_url]) freebieByUrl[fb.media_url] = []
      freebieByUrl[fb.media_url].push(fb)
    }

    const tagPublished = (item) => {
      const links = publishedLinkMap[item.url] || []
      const miscRows = miscByUrl[item.url] || []
      const fbRows = freebieByUrl[item.url] || []
      const charRows = charMediaByUrl[item.url] || []
      if (!links.length && !miscRows.length && !fbRows.length && !charRows.length) return item
      const liveChar = charRows.some(r => r.published)
      return {
        ...item,
        linkedPublished: links.length > 0 || liveChar,
        linkedCardMedia: charRows.length > 0,
        publishedLinks: links,
        protected: true,
        miscItems: miscRows,
        inMiscBeauties: miscRows.length > 0,
        freebies: fbRows,
        inFreebies: fbRows.length > 0,
        freebieId: fbRows[0]?.id || null,
        characterMediaLinks: charRows,
      }
    }

    const fromChats = (msgMedia || [])
      .filter(m => m.content && m.content !== 'generating')
      .map(m => tagPublished({
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
    const fromGallery = (galMedia || []).map(g => tagPublished({
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
          poster_url: c.poster_url || null,
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

  const saveCustomChipToCategory = async () => {
    const label = customChipLabel.trim()
    const text = customChipText.trim()
    const catId = customChipCat
    if (!label || !text) { alert('Need chip label and prompt text'); return }
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `custom_${Date.now()}`
    const nextCats = promptExtraCategories.map(c =>
      c.id === catId
        ? { ...c, options: [...(c.options || []), { id, label, text }] }
        : c
    )
    setCustomChipSaving(true)
    try {
      const { error } = await supabase.from('user_settings').upsert({
        id: 1,
        prompt_extra_categories: nextCats,
      })
      if (error) throw new Error(error.message)
      setPromptExtraCategories(nextCats)
      setCustomChipLabel('')
      setCustomChipText('')
      alert('Saved chip to ' + (nextCats.find(c => c.id === catId)?.label || catId))
    } catch (e) {
      alert('Could not save chip: ' + e.message)
    }
    setCustomChipSaving(false)
  }

  const buildCardTextFragment = () => {
    if (!cardTextOn || !cardTextContent.trim()) return ''
    const size = CARD_TEXT_SIZES.find(s => s.id === cardTextSize)?.text || 'medium-sized text'
    const pos = CARD_TEXT_POS.find(s => s.id === cardTextPos)?.text || 'at the bottom of the card'
    const font = CARD_TEXT_FONTS.find(s => s.id === cardTextFont)?.text || 'clean sans-serif lettering'
    const color = CARD_TEXT_COLORS.find(s => s.id === cardTextColor)?.text || 'white'
    return `${size} reading "${cardTextContent.trim()}" in ${color} ${font} ${pos}`
  }
  const composePromptWithExtras = (base) => {
    const parts = []
    const baseTrim = String(base || '').trim()
    if (baseTrim) parts.push(baseTrim)
    for (const catId of PROMPT_EXTRA_ORDER) {
      const optId = promptExtras[catId]
      if (!optId) continue
      const cat = promptExtraCategories.find(c => c.id === catId)
      const opt = cat?.options?.find(o => o.id === optId)
      if (opt?.text) parts.push(opt.text)
    }
    const textFrag = buildCardTextFragment()
    if (textFrag) parts.push(textFrag)
    return parts.join(', ')
  }

  const openCreate = () => {
    setPrompt('')
    setNegative(DEFAULT_NEGATIVE)
    setSeed('')
    setSize('768*1024')
    setCharId('')
    setGuidance(3.5)
    setSteps(28)
    setCreateModel((IMAGE_MODELS.find(m => m.family === 'seedream') || IMAGE_MODELS[0]).id)
    setCreateRefs([])
    setPickCreateRef(null)
    clearPromptExtras()
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
    setCreateModel((IMAGE_MODELS.find(m => m.family === 'seedream') || IMAGE_MODELS[0]).id)
    setCreateRefs([])
    setPickCreateRef(null)
    clearPromptExtras()
    setSelected(null)
    setShowCreate(true)
  }

  const createImage = async () => {
    if (!prompt.trim() || creating) return
    setCreating(true)
    try {
      const fam = imgFamilyOf(createModel)
      const maxR = createMaxRefs(createModel)
      const refUrls = createRefs.map(r => r?.url).filter(Boolean).slice(0, maxR)
      const composed = composePromptWithExtras(prompt.trim())
      const finalPrompt = withStyle(composed || prompt.trim(), createArtStyle)
      const useNeg = isStylizedArt(createArtStyle)
        ? [negative, STYLIZED_NEG].filter(Boolean).join(', ')
        : negative
      const payload = { model: createModel, prompt: finalPrompt }
      if (fam === 'grok') {
        payload.aspectRatio = '2:3'; payload.resolution = '2k'
      } else if (fam === 'seedream') {
        payload.size = '1328*1776'; payload.thinking = 'disabled'
      } else if (fam === 'schnell') {
        payload.size = size; payload.seed = seed || undefined; payload.negativePrompt = useNeg
      } else {
        payload.size = size; payload.seed = seed || undefined
        payload.negativePrompt = useNeg; payload.guidance = guidance; payload.steps = steps
      }
      // Up to 4 reference images (model maxRefs may be lower, e.g. Grok = 1)
      if (refUrls.length) {
        payload.referenceImageUrl = refUrls[0]
        payload.referenceImageUrls = refUrls
        if (refUrls[1]) payload.referenceImageUrl2 = refUrls[1]
        if (refUrls[2]) payload.referenceImageUrl3 = refUrls[2]
        if (refUrls[3]) payload.referenceImageUrl4 = refUrls[3]
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
        prompt: finalPrompt,
        negative_prompt: useNeg,
        seed: data.seed,
        size: data.size,
        character_id: charId || null,
        model: createModel,
      }, 'Your image')

      setShowCreate(false)
      setPrompt('')
      setSeed('')
      setCreateRefs([])
      setPickCreateRef(null)
      clearPromptExtras()
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
      if (String(videoModel || '').includes('seedance-2.5')) {
        payload.generate_audio = true
        payload.ratio = 'adaptive'
        payload.output_format = 'mp4'
        payload.watermark = false
      }
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

  // Capture a mid-frame (more reliable than end) and upload as poster JPEG
  const captureMidFrame = (url) => new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    let settled = false
    const fail = (msg) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(msg || 'Could not read video frame'))
    }
    const cleanup = () => {
      video.onseeked = null
      video.onerror = null
      video.onloadeddata = null
    }
    video.onerror = () => fail('Could not load video (CORS or bad URL)')
    video.onloadeddata = () => {
      if (!video.duration || !isFinite(video.duration) || video.duration <= 0) {
        // still try frame 0
        video.currentTime = 0
        return
      }
      const t = Math.min(Math.max(0.35, video.duration * 0.2), Math.max(0, video.duration - 0.05))
      video.currentTime = t
    }
    video.onseeked = () => {
      if (settled) return
      setTimeout(() => {
        if (settled) return
        try {
          const canvas = document.createElement('canvas')
          const w = video.videoWidth || 720
          const h = video.videoHeight || 1280
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0, w, h)
          settled = true
          cleanup()
          resolve(canvas.toDataURL('image/jpeg', 0.88))
        } catch (e) {
          fail(e.message || 'Canvas blocked (CORS)')
        }
      }, 80)
    }
    video.src = url
    video.load()
  })

  const dataUrlToBlob = (dataUrl) => {
    const [header, b64] = String(dataUrl).split(',')
    const mime = (header.match(/data:(.*?);/) || [])[1] || 'image/jpeg'
    const bin = atob(b64 || '')
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return new Blob([arr], { type: mime })
  }

  const uploadPosterBlob = async (blob) => {
    const fileName = `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error } = await supabase.storage
      .from('character-images')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })
    if (error) throw new Error(error.message)
    const { data: pub } = supabase.storage.from('character-images').getPublicUrl(fileName)
    if (!pub?.publicUrl) throw new Error('No public URL for poster')
    return pub.publicUrl
  }

  // Best-effort poster: lib makePoster → mid-frame capture → last-frame capture
  const ensurePosterUrl = async (videoUrl) => {
    if (!videoUrl) return null
    // 1) shared lib if available
    try {
      if (typeof makePoster === 'function') {
        const p = await makePoster(videoUrl)
        if (p) return p
      }
    } catch (e) {
      console.warn('makePoster failed', e)
    }
    // 2) mid-frame client capture + upload
    try {
      const dataUrl = await captureMidFrame(videoUrl)
      const blob = dataUrlToBlob(dataUrl)
      return await uploadPosterBlob(blob)
    } catch (e) {
      console.warn('mid-frame poster failed', e)
    }
    // 3) last-frame helper already in this file
    try {
      const dataUrl = await captureLastFrame(videoUrl)
      const blob = dataUrlToBlob(dataUrl)
      return await uploadPosterBlob(blob)
    } catch (e) {
      console.warn('last-frame poster failed', e)
    }
    return null
  }

  const generatePosterForItem = async (item) => {
    if (!item || item.type !== 'video' || !item.url) {
      alert('Select a video first')
      return
    }
    if (item.source !== 'gallery_media' && item.source !== 'cards') {
      alert('Posters can be generated for gallery videos and card animations')
      return
    }
    setBulkBusy(true)
    setBulkStatus('Generating poster…')
    try {
      const poster = await ensurePosterUrl(item.url)
      if (!poster) {
        alert(
          'Could not capture a frame from this video.\n\n' +
          'Usually CORS blocks canvas reads. Make sure the storage bucket allows cross-origin reads, or re-upload the video.'
        )
        return
      }
      if (item.source === 'cards') {
        const cardId = item.cardId || item.id
        const { error } = await supabase.from('cards').update({ poster_url: poster }).eq('id', cardId)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('gallery_media').update({ poster_url: poster }).eq('id', item.id)
        if (error) throw new Error(error.message)
      }
      setMedia(prev => prev.map(m => (m.key === item.key || (m.source === item.source && m.id === item.id && m.cardSide === item.cardSide)
        ? { ...m, poster_url: poster }
        : m)))
      setSelected(prev => (prev && prev.key === item.key ? { ...prev, poster_url: poster } : prev))
      alert('Poster saved')
    } catch (err) {
      alert('Poster failed: ' + err.message)
    }
    setBulkBusy(false)
    setBulkStatus('')
  }

  const backfillMissingPosters = async () => {
    const list = media.filter(m =>
      (m.source === 'gallery_media' || m.source === 'cards') &&
      m.type === 'video' &&
      m.id &&
      m.url &&
      !m.poster_url
    )
    if (!list.length) {
      alert('All videos already have posters (or none found)')
      return
    }
    if (!confirm(`Generate posters for ${list.length} video(s) missing thumbnails?`)) return
    setBulkBusy(true)
    let ok = 0
    let fail = 0
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      setBulkStatus(`Poster ${i + 1}/${list.length}…`)
      try {
        const poster = await ensurePosterUrl(item.url)
        if (!poster) { fail++; continue }
        let error = null
        if (item.source === 'cards') {
          const cardId = item.cardId || item.id
          ;({ error } = await supabase.from('cards').update({ poster_url: poster }).eq('id', cardId))
        } else {
          ;({ error } = await supabase.from('gallery_media').update({ poster_url: poster }).eq('id', item.id))
        }
        if (error) { fail++; continue }
        setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, poster_url: poster } : m)))
        ok++
      } catch {
        fail++
      }
    }
    setBulkBusy(false)
    setBulkStatus('')
    alert(`Posters: ${ok} created, ${fail} failed`)
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

  const makeBannerThumb = async (imageUrl) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })
      const maxW = 480
      const scale = Math.min(1, maxW / img.naturalWidth)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.72))
      if (!blob) return null
      const fileName = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error: upErr } = await supabase.storage
        .from('character-images')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { console.warn('thumb upload', upErr); return null }
      const { data: pub } = supabase.storage.from('character-images').getPublicUrl(fileName)
      return pub?.publicUrl || null
    } catch (err) {
      console.warn('makeBannerThumb', err)
      return null
    }
  }

  const toggleFavorite = async (item) => {
    if (item.source !== 'gallery_media') return
    const next = !item.is_favorite

    setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, is_favorite: next } : m)))
    setSelected(prev => (prev && prev.key === item.key ? { ...prev, is_favorite: next } : prev))

    const patch = { is_favorite: next }

    if (next && item.type === 'image' && !item.thumbnail_url) {
      const thumb = await makeBannerThumb(item.url)
      if (thumb) {
        patch.thumbnail_url = thumb
        setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, thumbnail_url: thumb } : m)))
        setSelected(prev => (prev && prev.key === item.key ? { ...prev, thumbnail_url: thumb } : prev))
      }
    }

    const { error } = await supabase
      .from('gallery_media')
      .update(patch)
      .eq('id', item.id)

    if (error) {
      alert('Could not update: ' + error.message)
      setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, is_favorite: !next } : m)))
      setSelected(prev => (prev && prev.key === item.key ? { ...prev, is_favorite: !next } : prev))
    }
  }

  // clear the copied indicator whenever the detail selection changes
  // (kept simple: reset on close/open via the button timeout is enough)

  const openTransform = (item) => {
    const model = 'bytedance/seedream-v5.0-pro/edit'
    setTransformSource(item)
    setTransformRefs([])
    setPickRefSlot(null)
    setTransformPrompt('')
    setTransformModel(model)
    setTransformSize(i2iDefaultSize(model))
    setSelected(null)
    setShowTransform(true)
  }

  const runTransform = async () => {
    if (transforming) return
    if (!transformPrompt.trim()) { alert('Describe the change you want'); return }
    setShowTransform(false)
    setPickRefSlot(null)
    setTransforming(true)
    try {
      const meta = i2iModelOf(transformModel)
      const max = meta.maxRefs || 1
      const extraUrls = transformRefs
        .map(r => r?.url)
        .filter(Boolean)
        .slice(0, Math.max(0, max - 1))
      const allUrls = [transformSource.url, ...extraUrls].filter(Boolean)

      const payload = {
        prompt: transformPrompt,
        referenceImageUrl: transformSource.url,
        model: transformModel,
      }
      if (allUrls.length > 1) {
        payload.referenceImageUrls = allUrls
        if (extraUrls[0]) payload.referenceImageUrl2 = extraUrls[0]
        if (extraUrls[1]) payload.referenceImageUrl3 = extraUrls[1]
        if (extraUrls[2]) payload.referenceImageUrl4 = extraUrls[2]
      }
      // Output size / ratio — shape depends on model family
      const sizeVal = transformSize || meta.defaultSize
      if (meta.sizeMode === 'aspect' && sizeVal && sizeVal.includes('|')) {
        const [ar, res] = sizeVal.split('|')
        payload.aspectRatio = ar
        payload.resolution = res || '2k'
      } else if (sizeVal) {
        payload.size = sizeVal
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
        size: data.size || (meta.sizeMode === 'pixel' ? sizeVal : null),
      }, 'Your transformed image')
      setTransformRefs([])
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
      const isKlingT2V = t2vModel.startsWith('kwaivgi/kling')
      const isSeedance25 = String(t2vModel || '').includes('seedance-2.5')
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
          ...(isSeedance25 ? {
            generate_audio: true,
            ratio: t2vAspect === '9:16' || t2vAspect === '16:9' || t2vAspect === '1:1' || t2vAspect === '3:4' || t2vAspect === '4:3'
              ? t2vAspect
              : 'adaptive',
            output_format: 'mp4',
            watermark: false,
          } : {}),
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


  const backfillMainBannerThumbs = async () => {
    const main = folders.find(f => String(f.name || '').trim().toLowerCase() === 'main banner')
    if (!main) { alert('Create a folder named "Main Banner" first'); return }
    const keys = Object.entries(folderMap).filter(([, fid]) => fid === main.id).map(([k]) => k)
    const items = media.filter(m => keys.includes(m.key) && m.source === 'gallery_media' && m.type === 'image')
    if (!items.length) { alert('No images in Main Banner'); return }
    let done = 0
    let skipped = 0
    for (const item of items) {
      if (item.thumbnail_url) { skipped++; continue }
      const thumb = await makeBannerThumb(item.url)
      if (!thumb) continue
      await supabase.from('gallery_media').update({ thumbnail_url: thumb }).eq('id', item.id)
      setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, thumbnail_url: thumb } : m)))
      done++
    }
    alert(`Thumbnails ready: ${done} created, ${skipped} already had one`)
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
        // Remove every key variant so we don't leave duplicate folder rows
        const keys = [item.key]
        if (item.source === 'gallery_media' && item.id) {
          keys.push(String(item.id))
          keys.push('gal_' + item.id)
        }
        for (const k of keys) {
          await supabase.from('folder_items').delete().eq('source', item.source).eq('item_key', k)
          await supabase.from('folder_items').delete().eq('item_key', k)
        }
        // If this was Main Banner art, drop stored banner thumb so swaps stay clean
        if (item.source === 'gallery_media' && item.id && item.thumbnail_url) {
          try {
            const path = String(item.thumbnail_url).split('/character-images/')[1]
            if (path && path.startsWith('thumb_')) {
              await supabase.storage.from('character-images').remove([path.split('?')[0]])
            }
          } catch {}
          await supabase.from('gallery_media').update({ thumbnail_url: null }).eq('id', item.id)
          setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, thumbnail_url: null } : m)))
          setSelected(prev => (prev && prev.key === item.key ? { ...prev, thumbnail_url: null } : prev))
        }
        return
      }

      // Clear other key variants for this item so Main Banner can't double-list it
      if (item.source === 'gallery_media' && item.id) {
        const variants = [String(item.id), 'gal_' + item.id, item.key]
        for (const k of variants) {
          if (k === item.key) continue
          await supabase.from('folder_items').delete().eq('item_key', k)
        }
      }

      const { error } = await supabase
        .from('folder_items')
        .upsert({ source: item.source, item_key: item.key, folder_id: folderId }, { onConflict: 'source,item_key' })
      if (error) alert('Could not move: ' + error.message)
      else {
        // Bump "recent" activity for this folder (media just added)
        setFolderActivity(prev => ({ ...prev, [folderId]: Date.now() }))
      }

      // Main Banner: always ensure a stored thumbnail for the game strip
      const folderMeta = folders.find(f => f.id === folderId)
      const isMainBanner = folderMeta && String(folderMeta.name || '').trim().toLowerCase() === 'main banner'
      if (
        isMainBanner &&
        item.source === 'gallery_media' &&
        item.type === 'image' &&
        item.id
      ) {
        if (!item.thumbnail_url) {
          const thumb = await makeBannerThumb(item.url)
          if (thumb) {
            await supabase.from('gallery_media').update({ thumbnail_url: thumb }).eq('id', item.id)
            setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, thumbnail_url: thumb } : m)))
            setSelected(prev => (prev && prev.key === item.key ? { ...prev, thumbnail_url: thumb } : prev))
          }
        }
      }
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



  const removeFromFreebies = async () => {
    if (!selected?.inFreebies) return
    const rows = selected.freebies || []
    if (!rows.length) return
    if (!confirm('Remove this from Freebies? Players will no longer see it in the FREEBIES tab.')) return
    for (const fb of rows) {
      await supabase.from('freebies').update({ active: false }).eq('id', fb.id)
    }
    await load()
    // keep selection refreshed
    alert('Removed from Freebies')
  }

  const openMakeFreebie = (mode = 'media') => {
    if (!selected && mode === 'media') return
    setFreebieType(mode)
    setFreebieTitle(mode === 'tokens' ? 'BabeBucks drop' : (selected?.prompt ? String(selected.prompt).slice(0, 40) : 'Free media'))
    setFreebieTokens('100')
    setFreebieMax('50')
    setShowFreebieModal(true)
  }

  const publishFreebie = async () => {
    if (freebieBusy) return
    const maxR = Math.max(1, parseInt(freebieMax) || 50)
    setFreebieBusy(true)
    try {
      const row = {
        type: freebieType,
        title: (freebieTitle || '').trim() || (freebieType === 'tokens' ? 'BabeBucks drop' : 'Free media'),
        token_amount: freebieType === 'tokens' ? (parseInt(freebieTokens) || 0) : null,
        media_url: freebieType === 'media' && selected ? selected.url : null,
        media_type: freebieType === 'media' && selected ? (selected.type === 'video' ? 'video' : 'image') : null,
        max_redemptions: maxR,
        redemption_count: 0,
        active: true,
      }
      const { error } = await supabase.from('freebies').insert([row])
      if (error) throw new Error(error.message)
      setShowFreebieModal(false)
      alert(`Freebie live: first ${maxR} people can redeem`)
    } catch (err) {
      alert('Freebie failed: ' + err.message)
    }
    setFreebieBusy(false)
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
    setMiscOverlayName('')
    setMiscOverlayFont('impact')
    setMiscOverlayPos('h-top-left')
    setMiscOverlaySize('md')
    setShowMiscModal(true)
  }

  const removeFromMisc = async () => {
    if (!selected) return
    const rows = selected.miscItems || []
    if (!rows.length) {
      // fallback: delete by url
      const ok = confirm(
        '⚠️ Remove this file from Misc Beauties?\n\n' +
        'It will no longer appear in the shop or Harem draws. Existing player purchases keep their copies.\n\nRemove?'
      )
      if (!ok) return
      const { error } = await supabase.from('misc_items').delete().eq('url', selected.url)
      if (error) { alert(error.message); return }
      await load()
      setSelected(null)
      alert('Removed from Misc Beauties')
      return
    }
    const labels = rows.map(r => r.public_id || r.id).join(', ')
    const ok = confirm(
      '⚠️ Remove from Misc Beauties?\n\n' +
      'IDs: ' + labels + '\n\n' +
      'This removes the shop listing(s). Players who already bought a copy keep it.\n\nRemove?'
    )
    if (!ok) return
    for (const r of rows) {
      const { error } = await supabase.from('misc_items').delete().eq('id', r.id)
      if (error) { alert(error.message); return }
    }
    await load()
    setSelected(null)
    alert('Removed from Misc Beauties')
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
        const wantedName = miscSetName.trim()
        // Reuse existing set if same name (case-insensitive) — no duplicate sets
        const existing = (miscSets || []).find(
          s => String(s.name || '').trim().toLowerCase() === wantedName.toLowerCase()
        )
        if (existing) {
          setId = existing.id
          prefix = existing.code_prefix || prefix
          setName = existing.name
        } else {
          // Double-check DB in case local list is stale
          const { data: dbHits } = await supabase
            .from('misc_sets')
            .select('*')
            .ilike('name', wantedName)
          const hit = (dbHits || []).find(
            s => String(s.name || '').trim().toLowerCase() === wantedName.toLowerCase()
          )
          if (hit) {
            setId = hit.id
            prefix = hit.code_prefix || prefix
            setName = hit.name
            setMiscSets(prev => {
              if (prev.some(x => x.id === hit.id)) return prev
              return [...prev, hit].sort((a, b) => a.name.localeCompare(b.name))
            })
          } else {
            prefix = (miscPrefix || miscSetName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'SET'
            const { data: created, error } = await supabase.from('misc_sets').insert([{
              name: wantedName,
              code_prefix: prefix,
            }]).select().single()
            if (error) {
              // unique constraint race → fetch and reuse
              if (/unique|duplicate/i.test(error.message || '')) {
                const { data: again } = await supabase.from('misc_sets').select('*').ilike('name', wantedName)
                const reuse = (again || [])[0]
                if (!reuse) throw new Error(error.message)
                setId = reuse.id
                prefix = reuse.code_prefix || prefix
                setName = reuse.name
              } else {
                throw new Error(error.message)
              }
            } else {
              setId = created.id
              setName = created.name
              setMiscSets(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
            }
          }
        }
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
      const overlayName = (miscOverlayName || '').trim() || null
      const { data: item, error: iErr } = await supabase.from('misc_items').insert([{
        set_id: setId,
        type: selected.type === 'video' ? 'video' : 'image',
        url: selected.url,
        title: selected.prompt ? String(selected.prompt).slice(0, 80) : null,
        public_id: publicId,
        sort_index: sortIndex,
        edition_size: 1000,
        published: true,
        overlay_name: overlayName,
        overlay_font: overlayName ? miscOverlayFont : null,
        overlay_position: overlayName ? miscOverlayPos : null,
        overlay_size: overlayName ? miscOverlaySize : null,
      }]).select().single()
      if (iErr) throw new Error(iErr.message)

      // Auto-place into Gallery folder "Misc Beauties"
      try {
        let { data: folders } = await supabase.from('gallery_folders').select('*')
        let folder = (folders || []).find(f => String(f.name || '').trim().toLowerCase() === 'misc beauties')
        if (!folder) {
          const { data: created } = await supabase.from('gallery_folders').insert([{ name: 'Misc Beauties' }]).select().single()
          folder = created
        }
        if (folder?.id && selected.source === 'gallery_media' && selected.id) {
          const key = 'gal_' + selected.id
          await supabase.from('folder_items').delete().eq('item_key', key)
          await supabase.from('folder_items').delete().eq('item_key', String(selected.id))
          await supabase.from('folder_items').upsert(
            { source: 'gallery_media', item_key: key, folder_id: folder.id },
            { onConflict: 'source,item_key' }
          )
        } else if (folder?.id && selected.url) {
          // Ensure a gallery_media row exists, then file it
          const { data: galRows } = await supabase.from('gallery_media').select('id').eq('url', selected.url).limit(1)
          let galId = galRows?.[0]?.id
          if (!galId) {
            const { data: ins } = await supabase.from('gallery_media').insert([{
              type: selected.type === 'video' ? 'video' : 'image',
              url: selected.url,
              prompt: selected.prompt || 'Misc Beauties',
              model: 'misc-publish',
            }]).select('id').single()
            galId = ins?.id
          }
          if (galId) {
            const key = 'gal_' + galId
            await supabase.from('folder_items').delete().eq('item_key', key)
            await supabase.from('folder_items').upsert(
              { source: 'gallery_media', item_key: key, folder_id: folder.id },
              { onConflict: 'source,item_key' }
            )
          }
        }
      } catch (e) {
        console.warn('misc folder place', e)
      }

      setShowMiscModal(false)
      load()
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
    if (item.linkedCardMedia || (item.characterMediaLinks || []).length > 0) {
      const rows = item.characterMediaLinks || []
      const names = [...new Set(rows.map(r => r.character_name || r.title || 'character'))].join(', ')
      const live = rows.some(r => r.published)
      const ok = confirm(
        '⚠️ This file is linked as card +media' +
        (names ? ` for: ${names}` : '') + '.\n\n' +
        (live
          ? 'It is LIVE in the game. Deleting removes it from character media draws and can break owned copies.\n\n'
          : 'It is tied to a card character (not necessarily published yet).\n\n') +
        'Delete anyway? This cannot be undone.'
      )
      if (!ok) return
    } else if (item.linkedPublished) {
      const links = (item.publishedLinks || []).join('\n• ')
      const hasMisc = (item.publishedLinks || []).some(l => String(l).startsWith('Misc Beauties'))
      const ok = confirm(
        '⚠️ This file is used by PUBLISHED game content:\n\n• ' + links +
        '\n\nDeleting it can break ' +
        (hasMisc ? 'Misc Beauties shop items, ' : '') +
        'cards, or media drops in the live game.\n\nDelete anyway?'
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

  const buildDownloadName = (item) => {
    const isVideo = item.type === 'video'
    const isModel = item.type === 'model'
    const stamp = new Date(item.created_at || Date.now()).toISOString().slice(0, 10)
    const base = (item.prompt ? String(item.prompt).slice(0, 30).replace(/[^a-z0-9]+/gi, '_') : item.type) || 'media'
    const urlLow = String(item.url || '').toLowerCase()
    let ext = isModel ? 'glb' : isVideo ? 'mp4' : 'jpg'
    if (urlLow.includes('.png')) ext = 'png'
    else if (urlLow.includes('.webp')) ext = 'webp'
    else if (urlLow.includes('.gif')) ext = 'gif'
    else if (urlLow.includes('.webm')) ext = 'webm'
    else if (urlLow.includes('.mp4')) ext = 'mp4'
    else if (urlLow.includes('.jpeg') || urlLow.includes('.jpg')) ext = 'jpg'
    downloadCounter.current += 1
    const seq = String(downloadCounter.current).padStart(3, '0')
    return `${base}_${stamp}_${seq}.${ext}`
  }

  const mimeFromName = (fileName, fallback = 'application/octet-stream') => {
    const n = String(fileName || '').toLowerCase()
    if (n.endsWith('.png')) return 'image/png'
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
    if (n.endsWith('.webp')) return 'image/webp'
    if (n.endsWith('.gif')) return 'image/gif'
    if (n.endsWith('.mp4')) return 'video/mp4'
    if (n.endsWith('.webm')) return 'video/webm'
    return fallback
  }

  const triggerBlobDownload = (blob, fileName) => {
    // Ensure correct MIME so Android saves as PNG/JPG instead of queuing oddly
    const mime = blob.type && blob.type !== 'application/octet-stream'
      ? blob.type
      : mimeFromName(fileName, 'image/jpeg')
    const typed = blob.type === mime ? blob : new Blob([blob], { type: mime })
    const objUrl = URL.createObjectURL(typed)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = fileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    // Synchronous click — must stay inside user gesture when possible
    a.click()
    // Keep blob URL alive longer; Android often finishes write after 1–2s
    setTimeout(() => {
      try { a.remove() } catch {}
      try { URL.revokeObjectURL(objUrl) } catch {}
    }, 60000)
  }

  const downloadItem = async (item) => {
    if (!item?.url) {
      alert('No file URL')
      return
    }
    const fileName = buildDownloadName(item)
    const wantMime = mimeFromName(fileName, item.type === 'video' ? 'video/mp4' : 'image/jpeg')

    // 0) Prefer prefetched blob (still inside user gesture — no await)
    const pre = prefetchBlobRef.current
    if (pre?.url === item.url && pre.blob && pre.blob.size > 0) {
      try {
        const typed = pre.blob.type && pre.blob.type !== 'application/octet-stream'
          ? pre.blob
          : new Blob([pre.blob], { type: wantMime })
        // File System Access API (Chrome desktop / some Android)
        if (typeof window.showSaveFilePicker === 'function') {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [{
                description: 'Media',
                accept: { [wantMime]: ['.' + fileName.split('.').pop()] },
              }],
            })
            const writable = await handle.createWritable()
            await writable.write(typed)
            await writable.close()
            return
          } catch (e) {
            // user cancelled or unsupported — fall through to anchor
            if (e && e.name === 'AbortError') return
          }
        }
        triggerBlobDownload(typed, fileName)
        return
      } catch (err) {
        console.warn('prefetch download failed', err)
      }
    }

    // 1) Fetch now, force MIME, then download
    try {
      const res = await fetch(item.url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const buf = await res.arrayBuffer()
      if (!buf || buf.byteLength === 0) throw new Error('Empty file')
      let mime = res.headers.get('content-type') || ''
      if (!mime || mime === 'application/octet-stream') mime = wantMime
      const blob = new Blob([buf], { type: mime })
      prefetchBlobRef.current = { url: item.url, blob, mime }
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Media',
              accept: { [mime]: ['.' + fileName.split('.').pop()] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch (e) {
          if (e && e.name === 'AbortError') return
        }
      }
      triggerBlobDownload(blob, fileName)
      return
    } catch (err) {
      console.warn('blob download failed', err)
    }

    // 2) Direct anchor (cross-origin may ignore download attr)
    try {
      const a = document.createElement('a')
      a.href = item.url
      a.download = fileName
      a.rel = 'noopener noreferrer'
      a.target = '_blank'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => a.remove(), 1000)
      return
    } catch (err) {
      console.warn('anchor download failed', err)
    }

    // 3) Last resort — open tab so user can long-press Save
    window.open(item.url, '_blank', 'noopener,noreferrer')
    alert('Could not force a download.\n\nFile opened in a new tab — long-press → Save image/video.')
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

  // Folder counts from folderMap
  const folderCounts = (() => {
    const counts = {}
    for (const fid of Object.values(folderMap || {})) {
      if (!fid) continue
      counts[fid] = (counts[fid] || 0) + 1
    }
    return counts
  })()

  const folderRecentTs = (folderId) => {
    const added = folderActivity[folderId] || 0
    const opened = folderAccessed[folderId] || 0
    return Math.max(added, opened)
  }

  const openFolder = (folderId) => {
    setActiveFolder(folderId)
    if (folderId === 'all' || folderId === 'unfiled') return
    const next = { ...folderAccessed, [folderId]: Date.now() }
    setFolderAccessed(next)
    try { localStorage.setItem('ga_folder_accessed', JSON.stringify(next)) } catch {}
  }

  const sortedFolders = (() => {
    const list = (folders || []).map(f => ({
      ...f,
      _count: folderCounts[f.id] || 0,
      _recent: folderRecentTs(f.id),
    }))
    const startsWithNum = (name) => /^\d/.test(String(name || '').trim())
    const cmpAlpha = (a, b) => {
      const an = String(a.name || '')
      const bn = String(b.name || '')
      const aNum = startsWithNum(an)
      const bNum = startsWithNum(bn)
      if (folderSort === 'alpha') {
        if (aNum && !bNum) return -1
        if (!aNum && bNum) return 1
      }
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' })
    }
    if (folderSort === 'recent') {
      // Recent = last media added to folder OR last time you opened it
      list.sort((a, b) => {
        const d = (a._recent || 0) - (b._recent || 0)
        return folderSortAsc ? d : -d
      })
    } else if (folderSort === 'size') {
      list.sort((a, b) => {
        const d = (a._count || 0) - (b._count || 0)
        return folderSortAsc ? d : -d
      })
    } else {
      list.sort((a, b) => {
        const c = cmpAlpha(a, b)
        return folderSortAsc ? c : -c
      })
    }
    return list
  })()

  const tab = (key, label) => (
    <button onClick={() => setFilter(key)}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold ${filter === key ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 w-full max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto">
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
          <button
            type="button"
            onClick={() => { setShowResetModal(true); setResetConfirmText(''); setResetStatus('') }}
            disabled={resetting}
            className="bg-red-950 hover:bg-red-900 disabled:opacity-50 rounded-full px-3 py-2 text-sm font-semibold text-red-300"
            title="Reset all data + storage (keeps Main Banner, +media, Misc Beauties folders)"
          >
            🗑 Reset
          </button>
          <button onClick={() => setShowT2V(true)} className="bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-2 text-sm font-semibold" title="Video from text">
            🎬 Text
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded-full px-3 py-2 text-sm font-semibold"
            title="Upload images or videos to Gallery"
          >
            {uploading ? '…' : '⬆ Upload'}
          </button>
          <button
            type="button"
            disabled={fetchingOrphans}
            onClick={fetchOrphansIntoGallery}
            className="bg-amber-900 hover:bg-amber-800 disabled:opacity-50 rounded-full px-3 py-2 text-sm font-semibold"
            title="Find storage files missing from Gallery and import them"
          >
            {fetchingOrphans ? '…' : 'Fetch'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={e => {
              const files = e.target.files
              if (files?.length) uploadFilesToGallery(files)
            }}
          />
          <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">
            + Create
          </button>
        </div>
      </div>
      {uploading && uploadStatus && (
        <div className="bg-emerald-950 border border-emerald-900 rounded-xl p-3 mb-4 text-sm text-emerald-200">
          {uploadStatus}
        </div>
      )}
      {fetchOrphanStatus && (
        <div className="bg-amber-950 border border-amber-900 rounded-xl p-3 mb-4 text-sm text-amber-100">
          {fetchOrphanStatus}
        </div>
      )}
      {bulkBusy && bulkStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          {bulkStatus}
        </div>
      )}

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
        <div className="mb-5">
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 items-center">
            <span className="text-[10px] text-gray-600 uppercase tracking-wide shrink-0">Folders</span>
            {[
              { key: 'alpha', label: folderSort === 'alpha' ? (folderSortAsc ? 'A–Z' : 'Z–A') : 'A–Z' },
              { key: 'recent', label: folderSort === 'recent' ? (folderSortAsc ? 'Recent ↑' : 'Recent ↓') : 'Recent' },
              { key: 'size', label: folderSort === 'size' ? (folderSortAsc ? 'Largest' : 'Smallest') : 'Largest' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (folderSort === key) setFolderSortAsc(a => !a)
                  else {
                    setFolderSort(key)
                    // defaults: alpha A-Z, recent newest-first, size largest-first
                    setFolderSortAsc(key === 'alpha')
                  }
                }}
                className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  folderSort === key ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 items-center">
            {[['all', 'All'], ['unfiled', 'Unfiled']].map(([val, label]) => (
              <button key={val} onClick={() => openFolder(val)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${activeFolder === val ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
                {label}
              </button>
            ))}
            {sortedFolders.map(f => (
              <button key={f.id}
                onClick={() => openFolder(f.id)}
                onDoubleClick={() => renameFolder(f)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${activeFolder === f.id ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
                📁 {f.name}{folderSort === 'size' ? ` (${f._count || 0})` : ''}
              </button>
            ))}
            <button onClick={createFolder}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-blue-400 border border-blue-900">
              ＋ Folder
            </button>
            <button type="button" onClick={backfillMainBannerThumbs}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-emerald-400 border border-emerald-900">
              🖼 Banner thumbs
            </button>
            <button type="button" onClick={backfillMissingPosters} disabled={bulkBusy}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-amber-300 border border-amber-900 disabled:opacity-40">
              ▶ Fix video posters
            </button>
            {activeFolder !== 'all' && activeFolder !== 'unfiled' && (
              <button onClick={() => { const f = folders.find(x => x.id === activeFolder); if (f) deleteFolder(f) }}
                className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-red-950 text-red-300">
                🗑 Delete
              </button>
            )}
          </div>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
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
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
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
                  {(item.publishedLinks || []).some(l => String(l).startsWith('Misc Beauties'))
                    ? ((item.publishedLinks || []).length === 1 ? '✨ Misc' : '📡 Live · Misc')
                    : '📡 Live'}
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
      {showCreate && (() => {
        const maxR = createMaxRefs(createModel)
        const refs = createRefs.slice(0, maxR)
        return (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">Create Image</h2>

            <label className="block text-xs text-gray-400 mb-1">Model</label>
            <select
              value={createModel}
              onChange={e => {
                const next = e.target.value
                setCreateModel(next)
                setCreateRefs(prev => prev.slice(0, createMaxRefs(next)))
              }}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500"
            >
              {IMAGE_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.maxRefs > 0 ? ` · up to ${m.maxRefs} ref${m.maxRefs > 1 ? 's' : ''}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(IMAGE_MODELS.find(m => m.id === createModel), '2k')}
            </p>

            {maxR > 0 && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Reference images (optional)</label>
                <div className="flex gap-2 mb-2 flex-wrap items-start">
                  {refs.map((ref, idx) => (
                    <div key={idx} className="relative">
                      <img src={ref.url} alt="" className="w-20 h-20 rounded-lg object-cover border border-pink-700" />
                      <button
                        type="button"
                        onClick={() => setCreateRefs(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 bg-red-800 text-white text-xs w-5 h-5 rounded-full"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {refs.length < maxR && (
                    <button
                      type="button"
                      onClick={() => setPickCreateRef('next')}
                      className="w-20 h-20 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:border-pink-500 hover:text-pink-300"
                    >
                      + Ref {refs.length + 1}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-600 mb-3">
                  Face, outfit, pose, or style refs. Up to {maxR} for this model.
                </p>
              </>
            )}

            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
              placeholder="describe the image..."
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Art Style</label>
            <select
              value={createArtStyle}
              onChange={e => setCreateArtStyle(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500"
            >
              {artStylesList.map(s => (
                <option key={s.label + s.value.slice(0, 12)} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              Appended to the end of your prompt on generate. Editable in Settings · default is Fortnite Style.
            </p>

            {/* Prompt extras — same as card creation */}
            <div className="mb-4 border border-gray-800 rounded-xl p-3 bg-black/40">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-pink-300">Prompt extras</p>
                <button type="button" onClick={clearPromptExtras} className="text-[10px] text-gray-500 hover:text-white">
                  Clear all
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mb-3">
                Tap a chip to use it. Pink <span className="text-pink-400 font-bold">+</span> adds a permanent option to that category.
              </p>

              {promptExtraCategories.map(cat => (
                <div key={cat.id} className="mb-3">
                  <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">{cat.label}</p>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {(cat.options || []).map(opt => {
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
                    <button
                      type="button"
                      onClick={() => {
                        setCustomChipCat(cat.id)
                        setCustomChipLabel('')
                        setCustomChipText('')
                      }}
                      className="text-[14px] leading-none w-7 h-7 rounded-full bg-pink-600 border border-pink-400 text-white font-bold hover:bg-pink-500"
                      title={`Add to ${cat.label}`}
                    >
                      +
                    </button>
                  </div>
                  {customChipCat === cat.id && (
                    <div className="mt-2 p-2 rounded-lg border border-pink-700 bg-pink-950/30 space-y-1.5">
                      <p className="text-[10px] text-pink-300 font-semibold">New {cat.label} chip</p>
                      <input
                        value={customChipLabel}
                        onChange={e => setCustomChipLabel(e.target.value)}
                        placeholder="Button label"
                        className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-pink-500"
                      />
                      <input
                        value={customChipText}
                        onChange={e => setCustomChipText(e.target.value)}
                        placeholder="Prompt text to append"
                        className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-pink-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomChipCat('')}
                          className="flex-1 bg-gray-800 rounded py-1.5 text-[11px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={customChipSaving}
                          onClick={saveCustomChipToCategory}
                          className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded py-1.5 text-[11px] font-semibold"
                        >
                          {customChipSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
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
                  <p className="text-[9px] text-gray-500 mb-1">Final prompt preview</p>
                  <p className="text-[11px] text-gray-300 leading-relaxed break-words">
                    {composePromptWithExtras(prompt) || '(add a base prompt)'}
                    {createArtStyle ? <span className="text-purple-400">, [art style]</span> : null}
                  </p>
                </div>
              )}
            </div>

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
              <button
                onClick={() => { setShowCreate(false); setCreateRefs([]); setPickCreateRef(null); clearPromptExtras() }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold"
              >
                Cancel
              </button>
              <button onClick={createImage} disabled={creating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {creating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Pick create reference — all images: gallery + cards + chat */}
      {pickCreateRef != null && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-4 z-[70] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full max-w-lg my-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">Pick reference image</h3>
              <button type="button" onClick={() => setPickCreateRef(null)} className="text-gray-400 text-lg px-2">✕</button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              Gallery, card fronts/backs, and chat images.
            </p>
            <input
              type="search"
              placeholder="Search name or prompt…"
              value={gSearch}
              onChange={e => setGSearch(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500"
            />
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
              {media
                .filter(m => {
                  if (m.type !== 'image' || !m.url) return false
                  if (createRefs.some(r => r?.url === m.url)) return false
                  const q = String(gSearch || '').trim().toLowerCase()
                  if (!q) return true
                  const hay = [
                    m.prompt,
                    m.cardLabel,
                    m.cardSide,
                    m.source,
                    m.name,
                    m.title,
                  ].filter(Boolean).join(' ').toLowerCase()
                  return hay.includes(q)
                })
                .map(m => (
                  <button
                    key={m.key || m.id || m.url}
                    type="button"
                    onClick={() => {
                      const maxR = createMaxRefs(createModel)
                      setCreateRefs(prev => {
                        const next = [...prev]
                        if (typeof pickCreateRef === 'number' && pickCreateRef >= 0) next[pickCreateRef] = m
                        else next.push(m)
                        return next.slice(0, maxR)
                      })
                      setPickCreateRef(null)
                    }}
                    className="relative rounded-lg overflow-hidden border border-gray-800 hover:border-pink-500 aspect-[3/4] bg-gray-800"
                  >
                    <img src={m.thumbnail_url || m.poster_url || m.url} alt="" className="w-full h-full object-cover object-top" />
                    {m.source === 'cards' && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-pink-200 px-1 py-0.5 truncate">
                        Card · {m.cardLabel || ''} {m.cardSide || ''}
                      </span>
                    )}
                    {m.source === 'messages' && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-1 py-0.5">
                        Chat
                      </span>
                    )}
                  </button>
                ))}
            </div>
            {media.filter(m => m.type === 'image' && m.url).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No images available</p>
            )}
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
              <option value={4}>4 seconds</option>
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={20}>20 seconds (Seedance 2.5)</option>
              <option value={30}>30 seconds (Seedance 2.5)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={videoRes} onChange={e => setVideoRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p (where supported)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowVideo(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={animate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Animate</button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ALL (same as Settings) */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-5 z-[100]">
          <div className="bg-gray-900 border border-red-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="font-bold text-lg text-red-400 mb-2">Confirm Reset All</h2>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Permanently deletes gallery, chat media, cards, characters, ownership, misc/+media content, and all storage files.
              <br /><br />
              Keeps empty folders:{' '}
              <span className="text-pink-300">Main Banner</span>,{' '}
              <span className="text-pink-300">+media</span>,{' '}
              <span className="text-pink-300">Misc Beauties</span>
              <br /><br />
              Type <span className="font-mono text-red-300">RESET</span> to confirm.
            </p>
            <input
              autoFocus
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runResetAll() }}
              placeholder="Type RESET"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-red-500 font-mono"
            />
            {resetStatus && <p className="text-xs text-gray-500 mb-3">{resetStatus}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowResetModal(false); setResetConfirmText('') }}
                disabled={resetting}
                className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runResetAll}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="flex-1 bg-red-900 hover:bg-red-800 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg py-3 font-semibold"
              >
                {resetting ? 'Resetting…' : 'Reset All'}
              </button>
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
      {showTransform && transformSource && (() => {
        const maxRefs = i2iMaxRefs(transformModel)
        const maxExtra = Math.max(0, maxRefs - 1)
        const extras = transformRefs.slice(0, maxExtra)
        return (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-[60] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-2">Transform Image</h2>
            <p className="text-xs text-gray-500 mb-3">
              Feeds this image into an edit model and changes it by your instruction, keeping the
              subject and composition. Good for tweaks and for keeping a face consistent. Saves as a new image.
            </p>

            <div className="flex gap-2 mb-3 items-start flex-wrap">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Main</p>
                <img src={transformSource.url} alt="" className="w-24 rounded-lg border border-gray-700" />
              </div>
              {extras.map((ref, idx) => (
                <div key={idx}>
                  <p className="text-[10px] text-gray-500 mb-1">Ref {idx + 2}</p>
                  <div className="relative inline-block">
                    <img src={ref.url} alt="" className="w-24 rounded-lg border border-pink-700" />
                    <button
                      type="button"
                      onClick={() => setTransformRefs(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-2 -right-2 bg-red-800 text-white text-xs w-6 h-6 rounded-full"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {maxExtra > 0 && extras.length < maxExtra && (
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => setPickRefSlot('next')}
                    className="w-24 h-24 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:border-pink-500 hover:text-pink-300"
                  >
                    + Ref {extras.length + 2}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-600 mb-3">
              {maxRefs <= 1
                ? 'This model uses the main image only (no extra refs).'
                : `Up to ${maxRefs} images total (main + ${maxExtra} refs). Outfit, pose, face, style.`}
            </p>

            <label className="block text-xs text-gray-400 mb-1">Edit Model</label>
            <select
              value={transformModel}
              onChange={e => {
                const next = e.target.value
                setTransformModel(next)
                const allow = Math.max(0, i2iMaxRefs(next) - 1)
                setTransformRefs(prev => prev.slice(0, allow))
                const opts = i2iSizesOf(next)
                const def = i2iDefaultSize(next)
                setTransformSize(opts.some(o => o.value === transformSize) ? transformSize : def)
              }}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500"
            >
              {I2I_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.maxRefs > 1 ? ` · up to ${m.maxRefs} refs` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(I2I_MODELS.find(m => m.id === transformModel))}
            </p>

            <label className="block text-xs text-gray-400 mb-1">Output size / ratio</label>
            <select
              value={
                i2iSizesOf(transformModel).some(o => o.value === transformSize)
                  ? transformSize
                  : i2iDefaultSize(transformModel)
              }
              onChange={e => setTransformSize(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500"
            >
              {i2iSizesOf(transformModel).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              Options depend on the model. Grok uses aspect + resolution; Seedream / Wan use pixel size.
            </p>

            <label className="block text-xs text-gray-400 mb-1">What should change?</label>
            <textarea value={transformPrompt} onChange={e => setTransformPrompt(e.target.value)} rows={4}
              placeholder="e.g. change the background to a sunlit beach; keep the person exactly the same"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500" />

            <div className="flex gap-2">
              <button
                onClick={() => { setShowTransform(false); setTransformRefs([]); setPickRefSlot(null) }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold"
              >
                Cancel
              </button>
              <button onClick={runTransform} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">
                Transform
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Pick extra reference — gallery + cards + chat */}
      {pickRefSlot != null && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-4 z-[70] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full max-w-lg my-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">Pick reference image</h3>
              <button type="button" onClick={() => setPickRefSlot(null)} className="text-gray-400 text-lg px-2">✕</button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              Gallery, card fronts/backs, and chat images.
            </p>
            <input
              type="search"
              placeholder="Search name or prompt…"
              value={gSearch}
              onChange={e => setGSearch(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500"
            />
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
              {media
                .filter(m => {
                  if (m.type !== 'image' || !m.url) return false
                  if (m.url === transformSource?.url) return false
                  if (transformRefs.some(r => r?.url === m.url)) return false
                  const q = String(gSearch || '').trim().toLowerCase()
                  if (!q) return true
                  const hay = [
                    m.prompt,
                    m.cardLabel,
                    m.cardSide,
                    m.source,
                    m.name,
                    m.title,
                  ].filter(Boolean).join(' ').toLowerCase()
                  return hay.includes(q)
                })
                .map(m => (
                  <button
                    key={m.key || m.id || m.url}
                    type="button"
                    onClick={() => {
                      const maxExtra = Math.max(0, i2iMaxRefs(transformModel) - 1)
                      setTransformRefs(prev => {
                        const next = [...prev]
                        if (typeof pickRefSlot === 'number' && pickRefSlot >= 0) {
                          next[pickRefSlot] = m
                        } else {
                          next.push(m)
                        }
                        return next.slice(0, maxExtra)
                      })
                      setPickRefSlot(null)
                    }}
                    className="relative rounded-lg overflow-hidden border border-gray-800 hover:border-pink-500 aspect-[3/4] bg-gray-800"
                  >
                    <img src={m.thumbnail_url || m.poster_url || m.url} alt="" className="w-full h-full object-cover object-top" />
                    {m.source === 'cards' && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-pink-200 px-1 py-0.5 truncate">
                        Card · {m.cardLabel || ''} {m.cardSide || ''}
                      </span>
                    )}
                    {m.source === 'messages' && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-1 py-0.5">
                        Chat
                      </span>
                    )}
                  </button>
                ))}
            </div>
            {media.filter(m => m.type === 'image' && m.url).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No other images available</p>
            )}
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
              <option value="21:9">21:9 (ultrawide)</option>
              <option value="adaptive">adaptive (Seedance 2.5)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={t2vDuration} onChange={e => setT2vDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {t2vModel.startsWith('kwaivgi/kling')
                ? Array.from({ length: 13 }, (_, i) => i + 3).map(s => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))
                : String(t2vModel || '').includes('seedance-2.5')
                ? [4, 5, 6, 8, 10, 12, 15, 20, 25, 30].map(s => (
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

              {selected.source === 'gallery_media' ? (
                <div className="pt-1 border-t border-gray-800">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500">Prompt</p>
                    <div className="flex items-center gap-2">
                      {editPrompt && (
                        <button
                          type="button"
                          onClick={() => copyUrl(editPrompt)}
                          className="text-purple-400 hover:text-purple-300 font-semibold"
                        >
                          {copiedUrl ? 'Copied' : 'Copy'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingPrompt || editPrompt === (selected.prompt || '')}
                        onClick={async () => {
                          setSavingPrompt(true)
                          try {
                            const val = editPrompt.trim() || null
                            const { error } = await supabase
                              .from('gallery_media')
                              .update({ prompt: val })
                              .eq('id', selected.id)
                            if (error) throw new Error(error.message)
                            setSelected(prev => prev ? { ...prev, prompt: val || '' } : prev)
                            setMedia(prev => prev.map(m =>
                              m.key === selected.key || m.id === selected.id
                                ? { ...m, prompt: val || '' }
                                : m
                            ))
                          } catch (err) {
                            alert('Could not save prompt: ' + err.message)
                          }
                          setSavingPrompt(false)
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold disabled:opacity-40"
                      >
                        {savingPrompt ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                    rows={4}
                    placeholder={
                      selected.model === 'upload' || !selected.model
                        ? 'Add a prompt or notes for this uploaded/imported file…'
                        : 'Edit prompt…'
                    }
                    className="w-full bg-black border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300 leading-snug outline-none focus:border-purple-500 resize-y min-h-[72px]"
                  />
                </div>
              ) : selected.prompt ? (
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
              ) : null}
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

              </>
            )}

            {selected.type === 'video' && (selected.source === 'gallery_media' || selected.source === 'cards') && (
              <button
                onClick={() => generatePosterForItem(selected)}
                disabled={bulkBusy}
                className="w-full bg-amber-900/80 hover:bg-amber-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2"
              >
                {selected.poster_url
                  ? '↻ Regenerate poster'
                  : selected.source === 'cards'
                    ? '🖼 Generate card animation poster'
                    : '🖼 Generate poster'}
              </button>
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
                <p className="text-[11px] text-pink-300 font-semibold">
                  {(selected.publishedLinks || []).some(l => String(l).startsWith('Misc Beauties'))
                    ? '✨ Published to Misc Beauties'
                    : '📡 Used by published content'}
                </p>
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
              selected.inFreebies ? (
                <button
                  onClick={removeFromFreebies}
                  className="w-full bg-gray-800 hover:bg-red-900/40 border border-red-800/50 rounded-lg py-2 text-sm font-semibold mt-2 text-red-300"
                >
                  Remove from Freebies
                </button>
              ) : (
                <button
                  onClick={() => openMakeFreebie('media')}
                  className="w-full bg-emerald-800 hover:bg-emerald-700 rounded-lg py-2 text-sm font-semibold mt-2"
                >
                  🎁 Make Freebie
                </button>
              )
            )}

{selected.source !== 'cards' && (
              selected.inMiscBeauties || (selected.publishedLinks || []).some(l => String(l).startsWith('Misc Beauties')) ? (
                <button
                  onClick={removeFromMisc}
                  className="w-full bg-amber-900 hover:bg-amber-800 rounded-lg py-2 text-sm font-semibold mt-2"
                >
                  ✦ Remove from Misc Beauties
                </button>
              ) : (
                <button
                  onClick={openAddMisc}
                  className="w-full bg-pink-800 hover:bg-pink-700 rounded-lg py-2 text-sm font-semibold mt-2"
                >
                  ✦ Add to Misc Beauties
                </button>
              )
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

            <label className="block text-xs text-gray-400 mb-1">Character name overlay (optional)</label>
            <input
              value={miscOverlayName}
              onChange={e => setMiscOverlayName(e.target.value)}
              placeholder="e.g. Tasha"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
            />
            {miscOverlayName.trim() && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Font</label>
                <select value={miscOverlayFont} onChange={e => setMiscOverlayFont(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
                  {NAME_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1">Position</label>
                <select value={miscOverlayPos} onChange={e => setMiscOverlayPos(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
                  {NAME_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1">Text size</label>
                <select value={miscOverlaySize} onChange={e => setMiscOverlaySize(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  {NAME_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <div className="relative h-36 rounded-xl overflow-hidden bg-gray-800 mb-3 border border-gray-700">
                  <div className="absolute inset-0 opacity-40 bg-gradient-to-br from-pink-900 to-black" />
                  <span
                    className="absolute text-white drop-shadow-lg px-2"
                    style={{
                      fontFamily: (NAME_FONTS.find(f => f.id === miscOverlayFont) || NAME_FONTS[0]).family,
                      fontWeight: (NAME_FONTS.find(f => f.id === miscOverlayFont) || NAME_FONTS[0]).weight,
                      fontSize: OVERLAY_SIZE_PX[miscOverlaySize] || OVERLAY_SIZE_PX.md,
                      ...(miscOverlayPos === 'h-top-left' ? { top: 8, left: 8 } : {}),
                      ...(miscOverlayPos === 'h-top-center' ? { top: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' } : {}),
                      ...(miscOverlayPos === 'h-top-right' ? { top: 8, right: 8, textAlign: 'right' } : {}),
                      ...(miscOverlayPos === 'h-bottom-left' ? { bottom: 8, left: 8 } : {}),
                      ...(miscOverlayPos === 'h-bottom-center' ? { bottom: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' } : {}),
                      ...(miscOverlayPos === 'h-bottom-right' ? { bottom: 8, right: 8, textAlign: 'right' } : {}),
                      ...(miscOverlayPos === 'v-upper-left' ? { top: 12, left: 6, writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : {}),
                      ...(miscOverlayPos === 'v-mid-left' ? { top: '50%', left: 6, writingMode: 'vertical-rl', transform: 'translateY(-50%) rotate(180deg)' } : {}),
                      ...(miscOverlayPos === 'v-upper-right' ? { top: 12, right: 6, writingMode: 'vertical-rl' } : {}),
                      ...(miscOverlayPos === 'v-mid-right' ? { top: '50%', right: 6, writingMode: 'vertical-rl', transform: 'translateY(-50%)' } : {}),
                    }}
                  >
                    {miscOverlayName.trim()}
                  </span>
                </div>
              </>
            )}

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

      {/* FREEBIE MODAL */}
      {showFreebieModal && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-5">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-md">
            <h2 className="font-bold text-lg mb-1">Make Freebie</h2>
            <p className="text-xs text-gray-500 mb-4">First X people to redeem get it free. Then it&apos;s gone.</p>

            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select value={freebieType} onChange={e => setFreebieType(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
              <option value="media">This media file</option>
              <option value="tokens">BabeBucks (coins)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input value={freebieTitle} onChange={e => setFreebieTitle(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />

            {freebieType === 'tokens' && (
              <>
                <label className="block text-xs text-gray-400 mb-1">BabeBucks each person gets</label>
                <input value={freebieTokens} onChange={e => setFreebieTokens(e.target.value)} type="number" min="1"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
              </>
            )}

            {freebieType === 'media' && selected && (
              <div className="mb-3 rounded-lg overflow-hidden border border-gray-800">
                {selected.type === 'video' ? (
                  <video src={selected.url} className="w-full max-h-40 object-cover" muted playsInline />
                ) : (
                  <img src={selected.url} alt="" className="w-full max-h-40 object-cover" />
                )}
              </div>
            )}

            <label className="block text-xs text-gray-400 mb-1">How many people can redeem (first X)</label>
            <input value={freebieMax} onChange={e => setFreebieMax(e.target.value)} type="number" min="1"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none" />

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowFreebieModal(false)} disabled={freebieBusy}
                className="flex-1 bg-gray-800 rounded-lg py-3 font-semibold">Cancel</button>
              <button type="button" onClick={publishFreebie} disabled={freebieBusy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold disabled:opacity-50">
                {freebieBusy ? 'Publishing…' : 'Go live'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
