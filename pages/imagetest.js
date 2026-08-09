// pages/imagetest.js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const MODELS = [
  // —— existing (kept) ——
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream' },
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux' },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux' },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine Quality', family: 'grok' },
  // —— newer Atlas options ——
  { id: 'bytedance/seedream-v5.0-lite/text-to-image', label: 'Seedream 5 Lite (faster)', family: 'seedream' },
  { id: 'black-forest-labs/flux-2-pro/text-to-image', label: 'Flux 2 Pro', family: 'flux' },
  { id: 'nano-banana/nano-banana-2/text-to-image', label: 'Nano Banana 2', family: 'flux' },
  { id: 'google/imagen4-ultra/text-to-image', label: 'Imagen 4 Ultra', family: 'flux' },
  { id: 'ideogram/ideogram-v3/text-to-image', label: 'Ideogram v3 (text/typography)', family: 'flux' },
  { id: 'qwen/qwen-image-2.0/text-to-image', label: 'Qwen Image 2.0', family: 'flux' },
]

const SEEDREAM_SIZES = [
  '2048*2048', '2304*1728', '1728*2304', '2720*1530', '1530*2720',
  '2496*1664', '1664*2496', '1024*1024', '1536*1536',
  '1776*1328', '1328*1776', '2048*1152', '1152*2048',
]

const FLUX_SIZES = [
  { value: '768*1024', label: 'Portrait 3:4' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
  { value: '1024*576', label: 'Wide 16:9' },
]

const GROK_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '1:2', '2:1']

const DEFAULT_NEGATIVE = 'blurry, (Asian), big hips, wide hips, mature woman, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

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

export default function ImageTest() {
  const [model, setModel] = useState(
    (MODELS.find(m => m.family === 'seedream') || MODELS[0]).id
  )
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [seed, setSeed] = useState('')
  const [size, setSize] = useState('768*1024')
  const [guidance, setGuidance] = useState(3.5)
  const [steps, setSteps] = useState(28)
  const [aspectRatio, setAspectRatio] = useState('2:3')
  const [resolution, setResolution] = useState('1k')
  const [seedreamSize, setSeedreamSize] = useState('2048*2048')
  const [outputFormat, setOutputFormat] = useState('jpeg')
  const [thinking, setThinking] = useState('disabled')
  const [imageUrl, setImageUrl] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [returnedSeed, setReturnedSeed] = useState(null)

  const [promptExtraCategories, setPromptExtraCategories] = useState(PROMPT_EXTRA_CATEGORIES)
  const [promptExtras, setPromptExtras] = useState({})
  const [customChipCat, setCustomChipCat] = useState('')
  const [customChipLabel, setCustomChipLabel] = useState('')
  const [customChipText, setCustomChipText] = useState('')
  const [customChipSaving, setCustomChipSaving] = useState(false)

  const family = MODELS.find(m => m.id === model)?.family

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('prompt_extra_categories')
          .eq('id', 1)
          .maybeSingle()
        if (Array.isArray(data?.prompt_extra_categories) && data.prompt_extra_categories.length) {
          setPromptExtraCategories(data.prompt_extra_categories)
        }
      } catch (e) {
        console.warn('prompt extras load', e)
      }
    })()
  }, [])

  const togglePromptExtra = (catId, optId) => {
    setPromptExtras(prev => {
      const next = { ...prev }
      if (next[catId] === optId) delete next[catId]
      else next[catId] = optId
      return next
    })
  }

  const clearPromptExtras = () => setPromptExtras({})

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
    return parts.join(', ')
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
      setCustomChipCat('')
      alert('Saved chip to ' + (nextCats.find(c => c.id === catId)?.label || catId))
    } catch (e) {
      alert('Could not save chip: ' + e.message)
    }
    setCustomChipSaving(false)
  }

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setResult('')
    setImageUrl('')
    setSaved(false)
    const finalPrompt = composePromptWithExtras(prompt.trim()) || prompt.trim()
    try {
      const res = await fetch('/api/generate-image-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: finalPrompt,
          negativePrompt: negative,
          seed,
          guidance,
          steps,
          aspectRatio,
          resolution,
          size: family === 'seedream' ? seedreamSize : size,
          outputFormat,
          thinking,
        }),
      })
      const data = await res.json()
      if (data.imageUrl) {
        setImageUrl(data.imageUrl)
        setReturnedSeed(data.seed ?? null)
      } else {
        setResult(JSON.stringify(data, null, 2))
      }
    } catch (err) {
      setResult('Error: ' + err.message)
    }
    setLoading(false)
  }

  const saveToGallery = async () => {
    if (!imageUrl) return
    const finalPrompt = composePromptWithExtras(prompt.trim()) || prompt.trim()
    const { error } = await supabase.from('gallery_media').insert([{
      type: 'image',
      url: imageUrl,
      prompt: finalPrompt,
      negative_prompt: (family === 'flux' || family === 'schnell') ? negative : null,
      seed: returnedSeed,
      size: family === 'seedream' ? seedreamSize : (family === 'grok' ? `${aspectRatio}|${resolution}` : size),
      model,
    }])
    if (error) { alert('Save failed: ' + error.message); return }
    setSaved(true)
  }

  const composedPreview = composePromptWithExtras(prompt)

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Image Test</h1>

      <label className="block text-xs text-gray-400 mb-1">Model</label>
      <select value={model} onChange={e => setModel(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
        {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <label className="block text-xs text-gray-400 mb-1">Prompt</label>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
        placeholder="describe the image..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

      <div className="mb-4 border border-gray-800 rounded-xl p-3 bg-black/40">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-pink-300">Prompt extras</p>
          <button type="button" onClick={clearPromptExtras} className="text-[10px] text-gray-500 hover:text-white">
            Clear all
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">
          Tap a chip to use it. Pink <span className="text-pink-400 font-bold">+</span> adds a permanent option.
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
                  <button type="button" onClick={() => setCustomChipCat('')} className="flex-1 bg-gray-800 rounded py-1.5 text-[11px]">
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
        {Object.keys(promptExtras).length > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-gray-950 border border-gray-800">
            <p className="text-[9px] text-gray-500 mb-1">Final prompt preview</p>
            <p className="text-[11px] text-gray-300 leading-relaxed break-words">
              {composedPreview || '(add a base prompt)'}
            </p>
          </div>
        )}
      </div>

      {(family === 'flux' || family === 'schnell') && (
        <>
          <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
          <textarea value={negative} onChange={e => setNegative(e.target.value)} rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

          <label className="block text-xs text-gray-400 mb-1">Size</label>
          <select value={size} onChange={e => setSize(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            {FLUX_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {family === 'flux' && (
            <>
              <label className="block text-xs text-gray-400 mb-1">Guidance: {guidance}</label>
              <input type="range" min="1" max="10" step="0.5" value={guidance}
                onChange={e => setGuidance(parseFloat(e.target.value))}
                className="w-full mb-3 accent-purple-500" />

              <label className="block text-xs text-gray-400 mb-1">Steps: {steps}</label>
              <input type="range" min="10" max="50" step="1" value={steps}
                onChange={e => setSteps(parseInt(e.target.value))}
                className="w-full mb-3 accent-purple-500" />
            </>
          )}
          {family === 'schnell' && (
            <p className="text-[10px] text-gray-600 mb-3">Flux Schnell is fixed few-step (very fast). No guidance/steps controls.</p>
          )}

          <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
          <input value={seed} onChange={e => setSeed(e.target.value)} placeholder="random if blank"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm" />
        </>
      )}

      {family === 'seedream' && (
        <>
          <label className="block text-xs text-gray-400 mb-1">Size</label>
          <select value={seedreamSize} onChange={e => setSeedreamSize(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            {SEEDREAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label className="block text-xs text-gray-400 mb-1">Format</label>
          <select value={outputFormat} onChange={e => setOutputFormat(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>

          <label className="block text-xs text-gray-400 mb-1">Thinking</label>
          <select value={thinking} onChange={e => setThinking(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm">
            <option value="disabled">Disabled (faster)</option>
            <option value="enabled">Enabled (higher quality)</option>
          </select>
          <p className="text-[10px] text-gray-600 -mt-3 mb-4">Seedream has no negative prompt or seed. Sizes are large (up to 2048).</p>
        </>
      )}

      {family === 'grok' && (
        <>
          <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            {GROK_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label className="block text-xs text-gray-400 mb-1">Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm">
            <option value="1k">1K</option>
            <option value="2k">2K</option>
          </select>
          <p className="text-[10px] text-gray-600 -mt-3 mb-4">Grok Imagine has no negative prompt or seed.</p>
        </>
      )}

      <button onClick={generate} disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4">
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="w-full rounded-lg mb-3" />
          {returnedSeed != null && (
            <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-xs">
              <span className="text-gray-400">Seed: <span className="font-mono text-gray-200">{returnedSeed}</span></span>
              <button onClick={() => navigator.clipboard?.writeText(String(returnedSeed))}
                className="text-purple-400 hover:text-purple-300 font-semibold">Copy</button>
            </div>
          )}
          <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-xs">
            <span className="text-gray-400 truncate mr-2 font-mono">{imageUrl}</span>
            <button onClick={() => navigator.clipboard?.writeText(imageUrl)}
              className="text-purple-400 hover:text-purple-300 font-semibold shrink-0">Copy</button>
          </div>
          <button onClick={saveToGallery} disabled={saved}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-60 rounded-lg py-3 font-semibold mb-4">
            {saved ? 'Saved to Gallery' : 'Save to Gallery'}
          </button>
        </>
      )}

      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  )
}
