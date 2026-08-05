// pages/settings.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import { makePoster } from '../lib/posterFrame'

// Built-in list (also used as reset). Fortnite is the intended default.
export const DEFAULT_ART_STYLES = [
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

const fortniteDefaultValue = () =>
  (DEFAULT_ART_STYLES.find(s => /fortnite/i.test(s.label)) || DEFAULT_ART_STYLES[1]).value

// Built-in prompt extra chips (Cards + Gallery). Editable; saved as prompt_extra_categories.
export const DEFAULT_PROMPT_EXTRA_CATEGORIES = [
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

export default function Settings() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedValue, setSavedValue] = useState('')
  const [appMode, setAppMode] = useState('creator')  // 'creator' | 'public'
  const [modeSaving, setModeSaving] = useState(false)
  const [artStyles, setArtStyles] = useState(DEFAULT_ART_STYLES)
  const [defaultArtStyle, setDefaultArtStyle] = useState(fortniteDefaultValue())
  const [artStylesSaving, setArtStylesSaving] = useState(false)
  const [editingStyleIdx, setEditingStyleIdx] = useState(null)
  const [promptExtraCats, setPromptExtraCats] = useState(DEFAULT_PROMPT_EXTRA_CATEGORIES)
  const [extrasSaving, setExtrasSaving] = useState(false)
  const [expandedExtraCat, setExpandedExtraCat] = useState('hair_color') // open one by default
  const [newOptLabel, setNewOptLabel] = useState('')
  const [newOptText, setNewOptText] = useState('')
  const [quickAddCatId, setQuickAddCatId] = useState('hair_color')
  const [tabBanners, setTabBanners] = useState({
    home: { image: '', video: '' },
    packs: { image: '', video: '' },
    shop: { image: '', video: '' },
    collection: { image: '', video: '' },
    duel: { image: '', video: '' },
  })
  const [tabTitles, setTabTitles] = useState({
    home: 'Home',
    packs: 'Mystery Packs',
    shop: 'Shop',
    collection: 'My Collection',
    duel: 'Duel',
  })
  const [editingTitle, setEditingTitle] = useState(null) // which tab key is being renamed
  const [shopIntroUrl, setShopIntroUrl] = useState('')
  const [bannerSaving, setBannerSaving] = useState(false)

  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState(null)

  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [orphanInfo, setOrphanInfo] = useState(null)
  const [dupScanning, setDupScanning] = useState(false)
  const [dupInfo, setDupInfo] = useState(null)
  const [dupDeleting, setDupDeleting] = useState(false)
  const [dupResult, setDupResult] = useState(null)
  const [keepChoice, setKeepChoice] = useState({})  // groupIndex -> fileName to KEEP

  const [fixScanning, setFixScanning] = useState(false)
  const [fixInfo, setFixInfo] = useState(null)
  const [fixResult, setFixResult] = useState(null)
  const [importResult, setImportResult] = useState(null)

  const [clearingAudio, setClearingAudio] = useState(false)
  const [audioResult, setAudioResult] = useState(null)

  const [posterizing, setPosterizing] = useState(false)
  const [posterStatus, setPosterStatus] = useState('')

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetStatus, setResetStatus] = useState('')
  const [resetResult, setResetResult] = useState(null)

  const [emptyingStorage, setEmptyingStorage] = useState(false)
  const [emptyStorageResult, setEmptyStorageResult] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('my_description, app_mode, tab_banners, tab_titles, shop_intro_url, art_styles, default_art_style, prompt_extra_categories')
      .eq('id', 1)
      .maybeSingle()
    const loaded = data?.my_description || ''
    setDescription(loaded)
    setSavedValue(loaded)
    setAppMode(data?.app_mode === 'public' ? 'public' : 'creator')
    const tb = data?.tab_banners || {}
    const norm = (v) => {
      if (!v) return { image: '', video: '' }
      if (typeof v === 'string') return { image: v, video: '' }
      return { image: v.image || '', video: v.video || '' }
    }
    setTabBanners({
      home: norm(tb.home),
      packs: norm(tb.packs),
      shop: norm(tb.shop),
      collection: norm(tb.collection),
      duel: norm(tb.duel),
    })
    setShopIntroUrl(data?.shop_intro_url || '')
    const tt = data?.tab_titles || {}
    setTabTitles({
      home: tt.home || 'Home',
      packs: tt.packs || 'Mystery Packs',
      shop: tt.shop || 'Shop',
      collection: tt.collection || 'My Collection',
      duel: tt.duel || 'Duel',
    })
    const styles = Array.isArray(data?.art_styles) && data.art_styles.length
      ? data.art_styles.map(s => ({ label: String(s.label || ''), value: String(s.value ?? '') }))
      : DEFAULT_ART_STYLES
    setArtStyles(styles)
    const def = data?.default_art_style
    if (def != null && styles.some(s => s.value === def)) setDefaultArtStyle(def)
    else {
      const ft = styles.find(s => /fortnite/i.test(s.label))
      setDefaultArtStyle(ft ? ft.value : (styles[1]?.value ?? ''))
    }
    if (Array.isArray(data?.prompt_extra_categories) && data.prompt_extra_categories.length) {
      setPromptExtraCats(
        data.prompt_extra_categories.map(c => ({
          id: String(c.id || ''),
          label: String(c.label || ''),
          options: Array.isArray(c.options)
            ? c.options.map(o => ({
                id: String(o.id || ''),
                label: String(o.label || ''),
                text: String(o.text || ''),
              }))
            : [],
        }))
      )
    } else {
      setPromptExtraCats(DEFAULT_PROMPT_EXTRA_CATEGORIES)
    }
    setLoading(false)
  }

  const savePromptExtras = async () => {
    if (extrasSaving) return
    const cleaned = promptExtraCats
      .map(c => ({
        id: String(c.id || '').trim() || String(c.label || '').toLowerCase().replace(/\s+/g, '_'),
        label: String(c.label || '').trim(),
        options: (c.options || [])
          .map(o => ({
            id: String(o.id || '').trim() || String(o.label || '').toLowerCase().replace(/\s+/g, '_'),
            label: String(o.label || '').trim(),
            text: String(o.text || '').trim(),
          }))
          .filter(o => o.label && o.text),
      }))
      .filter(c => c.label)
    setExtrasSaving(true)
    const { error } = await supabase.from('user_settings').upsert({
      id: 1,
      prompt_extra_categories: cleaned,
    })
    setExtrasSaving(false)
    if (error) {
      alert(
        'Could not save prompt extras: ' + error.message +
        '\n\nIf the column is missing, run in Supabase:\n' +
        'alter table user_settings add column if not exists prompt_extra_categories jsonb;'
      )
      return
    }
    setPromptExtraCats(cleaned)
    alert('Prompt extras saved. Cards & Gallery pick them up on next open/refresh.')
  }

  const addCustomOption = (catId) => {
    const label = newOptLabel.trim()
    const text = newOptText.trim()
    if (!label || !text) {
      alert('Need both a chip label and the prompt text that gets added.')
      return
    }
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `custom_${Date.now()}`
    setPromptExtraCats(prev =>
      prev.map(c =>
        c.id === catId
          ? { ...c, options: [...(c.options || []), { id, label, text }] }
          : c
      )
    )
    setNewOptLabel('')
    setNewOptText('')
  }

  const saveArtStyles = async () => {
    if (artStylesSaving) return
    const cleaned = artStyles
      .map(s => ({ label: String(s.label || '').trim(), value: String(s.value ?? '').trim() }))
      .filter(s => s.label)
    if (!cleaned.length) {
      alert('Keep at least one style (or reset to defaults).')
      return
    }
    let def = defaultArtStyle
    if (!cleaned.some(s => s.value === def)) def = cleaned.find(s => /fortnite/i.test(s.label))?.value ?? cleaned[0].value
    setArtStylesSaving(true)
    const { error } = await supabase.from('user_settings').upsert({
      id: 1,
      art_styles: cleaned,
      default_art_style: def,
    })
    setArtStylesSaving(false)
    if (error) {
      alert(
        'Could not save art styles: ' + error.message +
        '\n\nIf the column is missing, run in Supabase:\n' +
        'alter table user_settings add column if not exists art_styles jsonb;\n' +
        'alter table user_settings add column if not exists default_art_style text;'
      )
      return
    }
    setArtStyles(cleaned)
    setDefaultArtStyle(def)
    setEditingStyleIdx(null)
    alert('Art styles saved. Cards & Gallery will use these on next open/refresh.')
  }

  const saveBanners = async () => {
    if (bannerSaving) return
    setBannerSaving(true)
    const { error } = await supabase.from('user_settings').upsert({
      id: 1,
      tab_banners: tabBanners,
      tab_titles: tabTitles,
      shop_intro_url: shopIntroUrl.trim() || null,
    })
    setBannerSaving(false)
    if (error) alert('Could not save banners: ' + error.message)
    else alert('Game banners saved')
  }

  const setMode = async (mode) => {
    if (modeSaving) return
    setModeSaving(true)
    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: 1, app_mode: mode })
    setModeSaving(false)
    if (error) { alert('Could not switch mode: ' + error.message); return }
    setAppMode(mode)
    if (mode === 'public') router.push('/game')
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: 1, my_description: description })
    setSaving(false)
    if (error) {
      alert('Could not save: ' + error.message)
      return
    }
    setSaved(true)
    setSavedValue(description)
  }

  const cleanup = async () => {
    if (cleaning) return
    if (!confirm('Delete all images, audio, and video older than 90 days? Cards and character images are kept. This cannot be undone.')) return

    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/cleanup-media', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setCleanResult('Error: ' + data.error)
      } else {
        setCleanResult(`Deleted ${data.deleted} old file${data.deleted === 1 ? '' : 's'} (scanned ${data.scanned}, kept ${data.protectedCount} in use).`)
      }
    } catch (err) {
      setCleanResult('Error: ' + err.message)
    }
    setCleaning(false)
  }

  const scanBrokenLinks = async () => {
    if (fixScanning) return
    setFixScanning(true)
    setFixInfo(null)
    setFixResult(null)
    try {
      const res = await fetch('/api/fix-broken-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (data.error) setFixResult('Error: ' + data.error)
      else setFixInfo(data)
    } catch (err) {
      setFixResult('Error: ' + err.message)
    }
    setFixScanning(false)
  }

  const removeBrokenLinks = async () => {
    if (!fixInfo?.brokenCount) return
    if (!confirm(`Remove ${fixInfo.brokenCount} gallery entr${fixInfo.brokenCount === 1 ? 'y' : 'ies'} whose file no longer exists?`)) return
    setFixScanning(true)
    try {
      const res = await fetch('/api/fix-broken-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      if (data.error) setFixResult('Error: ' + data.error)
      else {
        setFixResult(`Removed ${data.removed} broken entr${data.removed === 1 ? 'y' : 'ies'}.`)
        setFixInfo(null)
      }
    } catch (err) {
      setFixResult('Error: ' + err.message)
    }
    setFixScanning(false)
  }

  const scanDuplicates = async () => {
    if (dupScanning) return
    setDupScanning(true)
    setDupInfo(null)
    setDupResult(null)
    try {
      const res = await fetch('/api/find-duplicates', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setDupResult('Error: ' + data.error)
      } else {
        setDupInfo(data)
        // default to keeping the oldest file in each group
        const defaults = {}
        data.groups?.forEach((g, i) => { defaults[i] = g.files[0].name })
        setKeepChoice(defaults)
      }
    } catch (err) {
      setDupResult('Error: ' + err.message)
    }
    setDupScanning(false)
  }

  const deleteDuplicateGroup = async (group, groupIndex) => {
    const keep = keepChoice[groupIndex]
    const toDelete = group.files.map(f => f.name).filter(n => n !== keep)
    if (toDelete.length === 0) return
    if (!confirm(`Delete ${toDelete.length} duplicate file(s), keeping "${keep}"?`)) return

    setDupDeleting(true)
    try {
      const res = await fetch('/api/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames: toDelete }),
      })
      const data = await res.json()
      if (data.error) {
        alert('Error: ' + data.error)
      } else {
        // remove this group from the list locally
        setDupInfo(prev => ({
          ...prev,
          groups: prev.groups.filter((_, i) => i !== groupIndex),
        }))
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setDupDeleting(false)
  }

  const deleteAllDuplicates = async () => {
    if (!dupInfo?.groups?.length) return
    const allToDelete = dupInfo.groups.flatMap((g, i) => {
      const keep = keepChoice[i]
      return g.files.map(f => f.name).filter(n => n !== keep)
    })
    if (allToDelete.length === 0) return
    if (!confirm(`Delete ${allToDelete.length} duplicate file(s) across ${dupInfo.groups.length} group(s)? This keeps one copy from each group.`)) return

    setDupDeleting(true)
    try {
      const res = await fetch('/api/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames: allToDelete }),
      })
      const data = await res.json()
      if (data.error) {
        setDupResult('Error: ' + data.error)
      } else {
        setDupResult(`Deleted ${data.deleted} duplicate file(s), cleared ${data.clearedRows} record(s).`)
        setDupInfo(null)
      }
    } catch (err) {
      setDupResult('Error: ' + err.message)
    }
    setDupDeleting(false)
  }

  const scanOrphans = async () => {
    if (scanning) return
    setScanning(true)
    setOrphanInfo(null)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (data.error) setImportResult('Error: ' + data.error)
      else setOrphanInfo(data)
    } catch (err) {
      setImportResult('Error: ' + err.message)
    }
    setScanning(false)
  }

  const runOrphans = async (mode) => {
    if (importing) return
    const count = orphanInfo?.orphanCount || 0
    const question = mode === 'delete'
      ? `Permanently delete ${count} orphaned file(s) from storage? This cannot be undone.`
      : `Import ${count} file(s) into the gallery?`
    if (!confirm(question)) return

    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, mode }),
      })
      const data = await res.json()
      if (data.error) {
        setImportResult('Error: ' + data.error)
      } else if (mode === 'delete') {
        setImportResult(`Deleted ${data.deleted} orphaned file(s).`)
        setOrphanInfo(null)
      } else {
        setImportResult(`Imported ${data.imported} file(s) into the gallery.`)
        setOrphanInfo(null)
      }
    } catch (err) {
      setImportResult('Error: ' + err.message)
    }
    setImporting(false)
  }

  // does this image URL actually load? broken/blank posters return false
  // a poster is "good" only if it loads AND isn't a flat black/blank frame
  const posterLoads = (url) => new Promise((resolve) => {
    if (!url) { resolve(false); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let done = false
    const finish = (ok) => { if (!done) { done = true; resolve(ok) } }
    img.onload = () => {
      if (!img.naturalWidth) { finish(false); return }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let min = 255, max = 0
        const step = Math.max(4, Math.floor((canvas.width * canvas.height) / 2000)) * 4
        for (let i = 0; i < data.length; i += step) {
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
          if (lum < min) min = lum
          if (lum > max) max = lum
        }
        // flat frame (black/blank) => treat as bad so it gets regenerated
        finish((max - min) >= 12)
      } catch {
        // tainted canvas: can't inspect, assume it's fine so we don't loop forever
        finish(true)
      }
    }
    img.onerror = () => finish(false)
    setTimeout(() => finish(false), 6000)
    img.src = url
  })

  const backfillPosters = async () => {
    if (posterizing) return
    setPosterizing(true)
    setPosterStatus('Checking existing thumbnails...')

    try {
      // gallery videos missing a poster
      const { data: gal } = await supabase
        .from('gallery_media')
        .select('id, url, poster_url')
        .eq('type', 'video')

      // include videos with no poster AND those whose poster no longer loads
      const galCandidates = (gal || []).filter(g => g.url)
      const galMissing = []
      for (const g of galCandidates) {
        if (!g.poster_url) { galMissing.push(g); continue }
        const ok = await posterLoads(g.poster_url)
        if (!ok) galMissing.push(g)
      }

      // animated cards missing a poster
      const { data: cards } = await supabase
        .from('cards')
        .select('id, video_url, poster_url')

      const cardCandidates = (cards || []).filter(c => c.video_url)
      const cardMissing = []
      for (const c of cardCandidates) {
        if (!c.poster_url) { cardMissing.push(c); continue }
        const ok = await posterLoads(c.poster_url)
        if (!ok) cardMissing.push(c)
      }

      // chat videos missing a poster
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, content, poster_url')
        .eq('role', 'video')

      const msgCandidates = (msgs || []).filter(m => m.content && m.content !== 'generating')
      const msgMissing = []
      for (const m of msgCandidates) {
        if (!m.poster_url) { msgMissing.push(m); continue }
        const ok = await posterLoads(m.poster_url)
        if (!ok) msgMissing.push(m)
      }

      const total = galMissing.length + cardMissing.length + msgMissing.length
      if (total === 0) {
        setPosterStatus('All videos already have working thumbnails.')
        setPosterizing(false)
        return
      }

      let done = 0
      let failed = 0

      for (const g of galMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(g.url)
        if (poster) {
          await supabase.from('gallery_media').update({ poster_url: poster }).eq('id', g.id)
        } else {
          failed++
        }
        done++
      }

      for (const c of cardMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(c.video_url)
        if (poster) {
          await supabase.from('cards').update({ poster_url: poster }).eq('id', c.id)
        } else {
          failed++
        }
        done++
      }

      for (const m of msgMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(m.content)
        if (poster) {
          await supabase.from('messages').update({ poster_url: poster }).eq('id', m.id)
        } else {
          failed++
        }
        done++
      }

      setPosterStatus(`Done. Created ${done - failed} poster(s)${failed ? `, ${failed} could not be read` : ''}.`)
    } catch (err) {
      setPosterStatus('Error: ' + err.message)
    }
    setPosterizing(false)
  }

  // Folder names that always survive a full reset (content is cleared; folder rows stay)
  const ESSENTIAL_FOLDER_NAMES = ['main banner', '+media', 'misc beauties']
  const isEssentialFolder = (name) =>
    ESSENTIAL_FOLDER_NAMES.includes(String(name || '').trim().toLowerCase())

  const ensureEssentialFolders = async () => {
    const wanted = [
      { name: 'Main Banner' },
      { name: '+media' },
      { name: 'Misc Beauties' },
    ]
    const { data: existing } = await supabase.from('gallery_folders').select('id, name')
    const have = new Set((existing || []).map(f => String(f.name || '').trim().toLowerCase()))
    for (const w of wanted) {
      if (!have.has(w.name.toLowerCase())) {
        await supabase.from('gallery_folders').insert([{ name: w.name }])
      }
    }
  }

  // Combined Reset All: wipe content + storage, keep essential empty folders
  const runResetAll = async () => {
    if (resetting) return
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      alert('Type RESET to confirm')
      return
    }
    setResetting(true)
    setResetResult(null)
    try {
      // 1) Clear folder memberships (folders themselves stay)
      setResetStatus('Clearing folder contents...')
      await supabase.from('folder_items').delete().neq('item_key', '__never__')

      // 2) Gallery media rows
      setResetStatus('Deleting gallery media...')
      await supabase.from('gallery_media').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      // 3) Chat media
      setResetStatus('Deleting chat images/videos...')
      await supabase.from('messages').delete().in('role', ['image', 'video'])

      // 4) Game / card ecosystem content
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

      // 5) Remove non-essential folders only
      setResetStatus('Pruning non-essential folders...')
      const { data: allFolders } = await supabase.from('gallery_folders').select('id, name')
      for (const f of allFolders || []) {
        if (!isEssentialFolder(f.name)) {
          await supabase.from('gallery_folders').delete().eq('id', f.id)
        }
      }
      // Ensure the three keepers exist even if they were missing
      await ensureEssentialFolders()

      // 6) Wipe storage bucket (all files)
      setResetStatus('Wiping storage files...')
      const storageRes = await fetch('/api/empty-storage', { method: 'POST' })
      const storageData = await storageRes.json()
      if (storageData.error) throw new Error('Storage wipe failed: ' + storageData.error)

      setResetStatus('')
      setResetting(false)
      setShowResetModal(false)
      setResetConfirmText('')
      setResetResult(
        `Reset complete. Removed ${storageData.deleted ?? '?'} storage file(s). ` +
        'Essential folders kept (empty): Main Banner, +media, Misc Beauties.'
      )
    } catch (err) {
      setResetting(false)
      setResetStatus('')
      setResetResult('Error: ' + err.message)
    }
  }

  const clearAudio = async () => {
    if (clearingAudio) return
    setClearingAudio(true)
    setAudioResult(null)
    try {
      // count first so the confirmation is meaningful
      const scanRes = await fetch('/api/clear-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const scan = await scanRes.json()
      if (scan.error) {
        setAudioResult('Error: ' + scan.error)
        setClearingAudio(false)
        return
      }
      if (!scan.audioCount) {
        setAudioResult('No audio files found.')
        setClearingAudio(false)
        return
      }
      if (!confirm(`Delete all ${scan.audioCount} audio file(s)? Voice lines will regenerate when replayed.`)) {
        setClearingAudio(false)
        return
      }

      const res = await fetch('/api/clear-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      if (data.error) setAudioResult('Error: ' + data.error)
      else setAudioResult(`Deleted ${data.deleted} audio file(s).`)
    } catch (err) {
      setAudioResult('Error: ' + err.message)
    }
    setClearingAudio(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 w-full max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Settings</h1>
        <span className="w-12"></span>
      </div>

      <label className="block text-sm text-gray-400 mb-1">How I Appear</label>
      <p className="text-xs text-gray-600 mb-2">
        Used when you appear in generated images. Individual characters can override this.
      </p>
      <textarea
        value={description}
        onChange={e => {
          setDescription(e.target.value)
          if (saved) setSaved(false)
        }}
        placeholder="e.g. 40yr old man, dark hair, short beard, athletic build"
        rows={4}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none mb-4"
      />

      <button
        onClick={save}
        disabled={saving || description === savedValue}
        className={`w-full rounded-lg py-3 font-semibold ${
          description === savedValue
            ? 'bg-gray-700 text-gray-400 cursor-default'
            : 'bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {saving ? 'Saving...' : description === savedValue ? 'Saved' : 'Save'}
      </button>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Art styles</h2>
        <p className="text-xs text-gray-600 mb-3">
          Used in Cards & Gallery create/edit. The style prompt is appended to the image prompt.
          Default is applied when you open those screens.
        </p>

        <label className="block text-xs text-gray-500 mb-1">Default style</label>
        <select
          value={defaultArtStyle}
          onChange={e => setDefaultArtStyle(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500"
        >
          {artStyles.map((s, i) => (
            <option key={i} value={s.value}>{s.label || '(unnamed)'}</option>
          ))}
        </select>

        <div className="space-y-2 mb-3">
          {artStyles.map((s, i) => (
            <div key={i} className="border border-gray-800 rounded-xl p-3 bg-gray-950/80">
              <div className="flex items-center gap-2 mb-1">
                <input
                  value={s.label}
                  onChange={e => {
                    const next = [...artStyles]
                    next[i] = { ...next[i], label: e.target.value }
                    setArtStyles(next)
                  }}
                  placeholder="Label (shown in dropdown)"
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => setEditingStyleIdx(editingStyleIdx === i ? null : i)}
                  className="text-[11px] text-pink-400 px-2 py-1"
                >
                  {editingStyleIdx === i ? 'Hide' : 'Edit prompt'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (artStyles.length <= 1) return
                    const next = artStyles.filter((_, j) => j !== i)
                    setArtStyles(next)
                    if (defaultArtStyle === s.value) {
                      const ft = next.find(x => /fortnite/i.test(x.label))
                      setDefaultArtStyle(ft?.value ?? next[0]?.value ?? '')
                    }
                    if (editingStyleIdx === i) setEditingStyleIdx(null)
                  }}
                  className="text-red-400 text-sm px-1"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
              {editingStyleIdx === i && (
                <textarea
                  value={s.value}
                  onChange={e => {
                    const next = [...artStyles]
                    next[i] = { ...next[i], value: e.target.value }
                    setArtStyles(next)
                  }}
                  rows={4}
                  placeholder="Prompt text appended to generations (leave empty for None)"
                  className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500 font-mono"
                />
              )}
              {defaultArtStyle === s.value && (
                <p className="text-[10px] text-emerald-400 mt-1">Default</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              setArtStyles([...artStyles, { label: 'New style', value: '' }])
              setEditingStyleIdx(artStyles.length)
            }}
            className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2.5 text-sm font-semibold"
          >
            + Add style
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Reset to built-in list (Fortnite default)?')) return
              setArtStyles(DEFAULT_ART_STYLES)
              setDefaultArtStyle(fortniteDefaultValue())
              setEditingStyleIdx(null)
            }}
            className="flex-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded-lg py-2.5 text-sm font-semibold"
          >
            Reset defaults
          </button>
        </div>
        <button
          type="button"
          onClick={saveArtStyles}
          disabled={artStylesSaving}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {artStylesSaving ? 'Saving…' : 'Save art styles'}
        </button>
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Prompt extras (chips)</h2>
        <p className="text-xs text-gray-600 mb-3">
          Used in Cards & Gallery create. Scroll here after Art styles. Add chips below, then save.
        </p>

        {/* Always-visible quick add — no expand required */}
        <div className="mb-4 border-2 border-pink-700/60 rounded-xl p-4 bg-pink-950/20">
          <p className="text-sm font-semibold text-pink-300 mb-2">＋ Add a chip to a category</p>
          <label className="block text-[10px] text-gray-500 mb-1">Category</label>
          <select
            value={quickAddCatId}
            onChange={e => {
              setQuickAddCatId(e.target.value)
              setExpandedExtraCat(e.target.value)
            }}
            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
          >
            {promptExtraCats.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <label className="block text-[10px] text-gray-500 mb-1">Chip label (what you see on the button)</label>
          <input
            value={newOptLabel}
            onChange={e => setNewOptLabel(e.target.value)}
            placeholder="e.g. Honey blonde"
            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
          />
          <label className="block text-[10px] text-gray-500 mb-1">Prompt text (what gets added to the prompt)</label>
          <input
            value={newOptText}
            onChange={e => setNewOptText(e.target.value)}
            placeholder="e.g. honey blonde hair with soft waves"
            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500"
          />
          <button
            type="button"
            onClick={() => {
              addCustomOption(quickAddCatId)
              setExpandedExtraCat(quickAddCatId)
            }}
            className="w-full bg-pink-600 hover:bg-pink-500 rounded-lg py-3 text-sm font-semibold"
          >
            + Add chip to {promptExtraCats.find(c => c.id === quickAddCatId)?.label || 'category'}
          </button>
          <p className="text-[10px] text-gray-500 mt-2">
            After adding, tap <span className="text-pink-300">Save prompt extras</span> at the bottom so it sticks.
          </p>
        </div>

        <p className="text-[10px] text-gray-500 mb-2">Tap a category to edit or delete existing chips:</p>
        {promptExtraCats.map((cat) => (
          <div key={cat.id} className="mb-3 border border-gray-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedExtraCat(expandedExtraCat === cat.id ? null : cat.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-950 text-left"
            >
              <span className="text-sm font-semibold">{cat.label}</span>
              <span className="text-[10px] text-gray-500">
                {(cat.options || []).length} options · {expandedExtraCat === cat.id ? '▲ Hide' : '▼ Edit list'}
              </span>
            </button>
            {expandedExtraCat === cat.id && (
              <div className="p-3 border-t border-gray-800 space-y-2">
                {(cat.options || []).map((opt, oi) => (
                  <div key={opt.id + oi} className="border border-gray-800 rounded-lg p-2 bg-black/40">
                    <div className="flex gap-2 mb-1">
                      <input
                        value={opt.label}
                        onChange={e => {
                          const v = e.target.value
                          setPromptExtraCats(prev =>
                            prev.map(c =>
                              c.id !== cat.id
                                ? c
                                : {
                                    ...c,
                                    options: c.options.map((o, i) =>
                                      i === oi ? { ...o, label: v } : o
                                    ),
                                  }
                            )
                          )
                        }}
                        className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-pink-500"
                        placeholder="Chip label"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPromptExtraCats(prev =>
                            prev.map(c =>
                              c.id !== cat.id
                                ? c
                                : { ...c, options: c.options.filter((_, i) => i !== oi) }
                            )
                          )
                        }
                        className="text-red-400 text-xs px-2"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={opt.text}
                      onChange={e => {
                        const v = e.target.value
                        setPromptExtraCats(prev =>
                          prev.map(c =>
                            c.id !== cat.id
                              ? c
                              : {
                                  ...c,
                                  options: c.options.map((o, i) =>
                                    i === oi ? { ...o, text: v } : o
                                  ),
                                }
                          )
                        )
                      }}
                      rows={2}
                      className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[11px] outline-none focus:border-pink-500 font-mono"
                      placeholder="Prompt text added when selected"
                    />
                  </div>
                ))}
                {(cat.options || []).length === 0 && (
                  <p className="text-[11px] text-gray-500">No chips yet — use the pink box above to add one.</p>
                )}
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2 mt-2 mb-2">
          <button
            type="button"
            onClick={() => {
              if (!confirm('Reset all prompt extras to built-in defaults?')) return
              setPromptExtraCats(DEFAULT_PROMPT_EXTRA_CATEGORIES)
              setExpandedExtraCat('hair_color')
            }}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg py-2.5 text-sm font-semibold"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={savePromptExtras}
            disabled={extrasSaving}
            className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-semibold"
          >
            {extrasSaving ? 'Saving…' : 'Save prompt extras'}
          </button>
        </div>
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">App Mode</h2>
        <p className="text-xs text-gray-600 mb-3">
          Creator = full studio. Public = game-facing UI (banners, packs, collection).
          Toggle is for you only — no logins yet.
        </p>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setMode('creator')}
            disabled={modeSaving}
            className={`flex-1 rounded-lg py-3 font-semibold ${appMode === 'creator' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Creator
          </button>
          <button
            onClick={() => setMode('public')}
            disabled={modeSaving}
            className={`flex-1 rounded-lg py-3 font-semibold ${appMode === 'public' ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Public / Game
          </button>
        </div>
        {appMode === 'public' && (
          <button onClick={() => router.push('/game')} className="w-full text-sm text-pink-400 hover:text-pink-300 py-2">
            Open public side →
          </button>
        )}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Game Tab Banners</h2>
        <p className="text-xs text-gray-600 mb-3">
          Landscape image URL for the top of each public tab (wide crop works best).
          Paste a public storage URL from your gallery.
        </p>
        {[
          { key: 'home', hint: 'Top of the main game screen (above the scrolling strip)' },
          { key: 'packs', hint: 'Top of the Packs tab' },
          { key: 'shop', hint: 'Top of the Shop tab' },
          { key: 'collection', hint: 'Top of the Mine / Collection tab' },
          { key: 'duel', hint: 'Top of the Duel tab' },
        ].map(({ key, hint }) => (
          <div key={key} className="mb-5 border border-gray-800 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-0.5">
              {editingTitle === key ? (
                <input
                  autoFocus
                  value={tabTitles[key] || ''}
                  onChange={e => setTabTitles(prev => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => setEditingTitle(null)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(null) }}
                  className="flex-1 bg-black border border-purple-500 rounded px-2 py-1 text-xs font-semibold outline-none"
                />
              ) : (
                <label className="block text-xs text-gray-300 font-semibold">{tabTitles[key] || key}</label>
              )}
              <button
                type="button"
                onClick={() => setEditingTitle(editingTitle === key ? null : key)}
                className="text-gray-500 hover:text-purple-400 text-sm px-1"
                title="Edit tab name"
              >
                ✎
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mb-2">{hint}</p>
            <p className="text-[10px] text-gray-500 mb-1">Static image (after video / always if no video)</p>
            <input
              value={tabBanners[key]?.image || ''}
              onChange={e => setTabBanners(prev => ({
                ...prev,
                [key]: { ...(prev[key] || {}), image: e.target.value },
              }))}
              placeholder="https://.../landscape.jpeg"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 mb-2"
            />
            <p className="text-[10px] text-gray-500 mb-1">Intro video (plays once when tab opens, then static)</p>
            <input
              value={tabBanners[key]?.video || ''}
              onChange={e => setTabBanners(prev => ({
                ...prev,
                [key]: { ...(prev[key] || {}), video: e.target.value },
              }))}
              placeholder="https://.../banner.mp4"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500"
            />
          </div>
        ))}
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1 mt-4">Shop intro video (with audio)</label>
        <p className="text-[10px] text-gray-600 mb-1">Plays full-screen when Shop opens, then closes automatically.</p>
        <input
          value={shopIntroUrl}
          onChange={e => setShopIntroUrl(e.target.value)}
          placeholder="https://.../intro.mp4"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 mb-3"
        />
        <button
          onClick={saveBanners}
          disabled={bannerSaving}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {bannerSaving ? 'Saving...' : 'Save game banners'}
        </button>
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Fix Broken Links</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds gallery entries whose file no longer exists in storage (e.g. deleted by mistake
          elsewhere) and removes the leftover entry so it stops showing as broken.
        </p>

        <button
          onClick={scanBrokenLinks}
          disabled={fixScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {fixScanning ? 'Scanning...' : 'Scan for broken links'}
        </button>

        {fixInfo && (
          <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
            {fixInfo.brokenCount === 0 ? (
              <p className="text-xs text-gray-400">No broken links found.</p>
            ) : (
              <>
                <p className="text-xs text-gray-300 mb-2">
                  Found {fixInfo.brokenCount} entr{fixInfo.brokenCount === 1 ? 'y' : 'ies'} pointing at missing files.
                </p>
                <ul className="text-[10px] text-gray-500 mb-3 space-y-0.5">
                  {fixInfo.sample.map(s => (
                    <li key={s.id} className="truncate">{s.type}: {s.prompt || '(no prompt)'}</li>
                  ))}
                  {fixInfo.brokenCount > fixInfo.sample.length && (
                    <li className="text-gray-600">...and {fixInfo.brokenCount - fixInfo.sample.length} more</li>
                  )}
                </ul>
                <button
                  onClick={removeBrokenLinks}
                  disabled={fixScanning}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold"
                >
                  Remove {fixInfo.brokenCount} broken entr{fixInfo.brokenCount === 1 ? 'y' : 'ies'}
                </button>
              </>
            )}
          </div>
        )}

        {fixResult && <p className="text-xs text-gray-400 mt-3">{fixResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Find Duplicates</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds files that look like accidental duplicates — same base name with a (1)/(2)-style
          suffix and matching file size. Pick which copy to keep in each group.
        </p>

        <button
          onClick={scanDuplicates}
          disabled={dupScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {dupScanning ? 'Scanning...' : 'Scan for duplicates'}
        </button>

        {dupInfo && (
          <div className="mt-3 space-y-3">
            {dupInfo.groupCount === 0 ? (
              <p className="text-xs text-gray-400">No likely duplicates found.</p>
            ) : (
              <>
                <p className="text-xs text-gray-300">
                  Found {dupInfo.groupCount} group(s), {dupInfo.totalDuplicateFiles} extra file(s) that could be removed.
                </p>

                {dupInfo.groups.map((g, i) => (
                  <div key={g.baseKey} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 font-mono mb-2 truncate">{g.baseKey}</p>
                    {g.files.map(f => (
                      <label key={f.name} className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                        <input
                          type="radio"
                          name={`keep-${i}`}
                          checked={keepChoice[i] === f.name}
                          onChange={() => setKeepChoice(prev => ({ ...prev, [i]: f.name }))}
                        />
                        <span className="font-mono truncate flex-1">{f.name}</span>
                        <span className="text-gray-600">{f.size ? `${Math.round(f.size / 1024)}KB` : ''}</span>
                      </label>
                    ))}
                    <p className="text-[10px] text-gray-600 mt-1 mb-2">Keeping the selected file, deleting the rest in this group.</p>
                    <button
                      onClick={() => deleteDuplicateGroup(g, i)}
                      disabled={dupDeleting}
                      className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold"
                    >
                      Delete duplicates in this group
                    </button>
                  </div>
                ))}

                <button
                  onClick={deleteAllDuplicates}
                  disabled={dupDeleting}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-3 font-semibold"
                >
                  {dupDeleting ? 'Working...' : `Delete all ${dupInfo.totalDuplicateFiles} duplicate(s)`}
                </button>
              </>
            )}
          </div>
        )}

        {dupResult && <p className="text-xs text-gray-400 mt-3">{dupResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Import Orphaned Media</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds files in storage that nothing in the app points at. These are usually leftovers from
          earlier deletions, or clips made on the test page. Import the ones worth keeping, or delete
          them to free up storage.
        </p>

        <button
          onClick={scanOrphans}
          disabled={scanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {scanning ? 'Scanning...' : 'Scan for orphaned files'}
        </button>

        {orphanInfo && (
          <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-300 mb-2">
              Found {orphanInfo.orphanCount} orphaned file(s) out of {orphanInfo.scanned} scanned.
            </p>
            {orphanInfo.sample?.length > 0 && (
              <ul className="text-[10px] text-gray-500 font-mono mb-3 space-y-0.5">
                {orphanInfo.sample.map(n => <li key={n} className="truncate">{n}</li>)}
                {orphanInfo.orphanCount > orphanInfo.sample.length && (
                  <li className="text-gray-600">...and {orphanInfo.orphanCount - orphanInfo.sample.length} more</li>
                )}
              </ul>
            )}
            {orphanInfo.orphanCount > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => runOrphans('import')}
                  disabled={importing}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-2 text-sm font-semibold"
                >
                  {importing ? 'Working...' : `Import ${orphanInfo.orphanCount} into gallery`}
                </button>
                <button
                  onClick={() => runOrphans('delete')}
                  disabled={importing}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold"
                >
                  {importing ? 'Working...' : `Delete ${orphanInfo.orphanCount} from storage`}
                </button>
              </div>
            )}
          </div>
        )}

        {importResult && <p className="text-xs text-gray-400 mt-3">{importResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Video Thumbnails</h2>
        <p className="text-xs text-gray-600 mb-3">
          Generates still thumbnails for existing videos so the gallery no longer loads full videos
          just to show them. This is the main fix for high storage bandwidth. Keep this tab open while it runs.
        </p>

        <button
          onClick={backfillPosters}
          disabled={posterizing}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {posterizing ? 'Working...' : 'Generate thumbnails for existing videos'}
        </button>

        {posterStatus && <p className="text-xs text-gray-400 mt-3">{posterStatus}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Clear Voice Audio</h2>
        <p className="text-xs text-gray-600 mb-3">
          Deletes every voice clip in storage, whatever its age. Lines regenerate automatically
          the next time you play them.
        </p>

        <button
          onClick={clearAudio}
          disabled={clearingAudio}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {clearingAudio ? 'Working...' : 'Delete all audio files'}
        </button>

        {audioResult && <p className="text-xs text-gray-400 mt-3">{audioResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Storage Cleanup</h2>
        <p className="text-xs text-gray-600 mb-3">
          Deletes chat and gallery media (images, audio, video) that's 90 days old or older.
          Card art and character images are always kept.
        </p>

        <button
          onClick={cleanup}
          disabled={cleaning}
          className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {cleaning ? 'Cleaning up...' : 'Delete media older than 90 days'}
        </button>

        {cleanResult && (
          <p className="text-xs text-gray-400 mt-3">{cleanResult}</p>
        )}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6 mb-10">
        <h2 className="font-semibold mb-1 text-red-400">Reset All</h2>
        <p className="text-xs text-gray-600 mb-3">
          One button for a full wipe: gallery media, chat media, cards, characters, game ownership,
          misc/+media content, and <strong>all storage files</strong>.
          <br /><br />
          <span className="text-gray-400">Keeps these folders (empty):</span>{' '}
          <span className="text-pink-300">Main Banner</span>,{' '}
          <span className="text-pink-300">+media</span>,{' '}
          <span className="text-pink-300">Misc Beauties</span>.
          Other folders are removed. Content inside every folder is deleted.
        </p>

        <button
          onClick={() => { setShowResetModal(true); setResetConfirmText(''); setResetResult(null) }}
          disabled={resetting}
          className="w-full bg-red-950 hover:bg-red-900 disabled:opacity-50 border border-red-800 rounded-lg py-3 font-semibold text-red-300"
        >
          Reset all data + storage…
        </button>

        {resetResult && <p className="text-xs text-gray-400 mt-3">{resetResult}</p>}
      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-5 z-50">
          <div className="bg-gray-900 border border-red-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="font-bold text-lg text-red-400 mb-2">Confirm Reset All</h2>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Permanently deletes:
              <br />• All gallery images / videos
              <br />• All chat images &amp; videos
              <br />• All cards, characters, ownership
              <br />• Misc Beauties &amp; +media content
              <br />• All files in storage
              <br /><br />
              Keeps empty folders: <span className="text-pink-300">Main Banner</span>,{' '}
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
                onClick={() => { setShowResetModal(false); setResetConfirmText('') }}
                disabled={resetting}
                className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
              >
                Cancel
              </button>
              <button
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
    </div>
  )
}