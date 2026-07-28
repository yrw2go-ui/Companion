// pages/create.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

const IMAGE_MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux' },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux' },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell' },
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok' },
]
const familyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

const DEFAULT_NEGATIVE = 'blurry, (Asian), big hips, wide hips, mature woman, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

export default function CreateCharacter() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    age: '',
    appearance: '',
    personality: '',
    speaking_style: '',
    backstory: '',
    relationship: '',
  })

  // avatar generation
  const [imageModel, setImageModel] = useState('z-image/turbo')
  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarNegative, setAvatarNegative] = useState(DEFAULT_NEGATIVE)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarSeed, setAvatarSeed] = useState(null)
  const [genning, setGenning] = useState(false)
  const [showAvatarInfo, setShowAvatarInfo] = useState(false)

  const update = (field, value) => {
    setForm({ ...form, [field]: value })
  }

  const prefillFromAppearance = () => {
    const base = form.appearance?.trim()
      ? `Portrait of ${form.name || 'a person'}, ${form.appearance}. Professional photography, natural lighting, sharp focus.`
      : `Portrait of ${form.name || 'a person'}, professional photography, natural lighting, sharp focus.`
    setAvatarPrompt(base)
  }

  const generateAvatar = async () => {
    const promptToUse = avatarPrompt.trim() || (form.appearance?.trim()
      ? `Portrait of ${form.name || 'a person'}, ${form.appearance}. Professional photography, natural lighting, sharp focus.`
      : '')
    if (!promptToUse) {
      alert('Add an appearance or type an avatar prompt first')
      return
    }
    setGenning(true)
    setAvatarUrl('')
    try {
      const fam = familyOf(imageModel)
      const payload = { model: imageModel, prompt: promptToUse }
      if (fam === 'grok') {
        payload.aspectRatio = '3:4'; payload.resolution = '2k'
      } else if (fam === 'seedream') {
        payload.size = '1328*1776'; payload.thinking = 'disabled'
      } else if (fam === 'schnell') {
        payload.size = '768*1024'; payload.negativePrompt = avatarNegative
      } else {
        payload.size = '768*1024'; payload.negativePrompt = avatarNegative
        payload.guidance = 3.5; payload.steps = 28
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.imageUrl) { alert('Error: ' + (data.error || 'failed')); setGenning(false); return }
      setAvatarUrl(data.imageUrl)
      setAvatarSeed(data.seed ?? null)

      // also keep a copy in the gallery, since this is a real generation
      await supabase.from('gallery_media').insert([{
        type: 'image',
        url: data.imageUrl,
        prompt: promptToUse,
        negative_prompt: avatarNegative,
        seed: data.seed ?? null,
      }])
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setGenning(false)
  }

  const save = async () => {
    if (!form.name.trim()) {
      alert('Please give your character a name')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('characters')
      .insert([{
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        appearance: form.appearance,
        personality: form.personality,
        speaking_style: form.speaking_style,
        backstory: form.backstory,
        relationship: form.relationship,
        avatar_url: avatarUrl || null,
        image_model: imageModel,
      }])
      .select()
      .single()

    setSaving(false)
    if (error) {
      alert('Error saving: ' + error.message)
      return
    }
    router.push('/')
  }

  const field = (label, key, placeholder, multiline = false) => (
    <div className="mb-4">
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => update(key, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        />
      ) : (
        <input
          value={form[key]}
          onChange={e => update(key, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        />
      )}
    </div>
  )

  const fam = familyOf(imageModel)

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Cancel</button>
        <h1 className="text-2xl font-bold">Create Character</h1>
        <span className="w-12" />
      </div>

      {field('Name', 'name', 'e.g. Aria')}
      {field('Age', 'age', 'e.g. 28')}
      {field('Appearance', 'appearance', 'How they look', true)}
      {field('Personality', 'personality', 'Witty, warm, sarcastic...', true)}
      {field('Speaking Style', 'speaking_style', 'Casual, poetic, blunt...', true)}
      {field('Backstory', 'backstory', 'Their history and background', true)}
      {field('Relationship to You', 'relationship', 'Friend, partner, mentor...', true)}

      {/* Avatar generation */}
      <div className="border-t border-gray-800 pt-5 mt-2 mb-4">
        <h2 className="font-semibold mb-1">Avatar</h2>
        <p className="text-xs text-gray-600 mb-3">Generate a portrait to use as this character's thumbnail.</p>

        <label className="block text-sm text-gray-400 mb-1">Image Model</label>
        <select value={imageModel} onChange={e => setImageModel(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-1 text-white focus:border-purple-500 outline-none">
          {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-[10px] text-gray-600 mb-3">
          {fam === 'seedream' && 'Highest resolution. No seed or negative prompt.'}
          {fam === 'grok' && 'Stylized. No seed or negative prompt.'}
          {fam === 'schnell' && 'Fast, lower cost. Uses negative prompt.'}
          {fam === 'flux' && 'Balanced. Uses negative prompt.'}
        </p>

        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm text-gray-400">Avatar Prompt</label>
          <button onClick={prefillFromAppearance} className="text-[11px] text-purple-400 hover:text-purple-300">
            Fill from appearance
          </button>
        </div>
        <textarea value={avatarPrompt} onChange={e => setAvatarPrompt(e.target.value)} rows={3}
          placeholder="Describe the portrait, or tap 'Fill from appearance'"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-white focus:border-purple-500 outline-none" />

        {(fam === 'flux' || fam === 'schnell') && (
          <>
            <label className="block text-sm text-gray-400 mb-1">Negative Prompt</label>
            <textarea value={avatarNegative} onChange={e => setAvatarNegative(e.target.value)} rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-white text-xs focus:border-purple-500 outline-none" />
          </>
        )}

        <button onClick={generateAvatar} disabled={genning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2.5 font-semibold mb-3">
          {genning ? 'Generating... (up to 1 min)' : avatarUrl ? 'Regenerate Avatar' : 'Generate Avatar'}
        </button>

        {avatarUrl && (
          <div>
            <img
              src={avatarUrl}
              alt="avatar"
              onClick={() => setShowAvatarInfo(v => !v)}
              className="w-32 h-40 object-cover rounded-lg border border-gray-700 cursor-pointer"
            />
            {showAvatarInfo && (
              <div className="mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs space-y-2">
                {avatarSeed != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Seed: <span className="font-mono text-gray-200">{avatarSeed}</span></span>
                    <button onClick={() => navigator.clipboard?.writeText(String(avatarSeed))}
                      className="text-purple-400 hover:text-purple-300 font-semibold">Copy</button>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-400 truncate font-mono">{avatarUrl}</span>
                  <button onClick={() => navigator.clipboard?.writeText(avatarUrl)}
                    className="text-purple-400 hover:text-purple-300 font-semibold shrink-0">Copy</button>
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-600 mt-1">Tap the image to see seed and URL.</p>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mt-2"
      >
        {saving ? 'Saving...' : 'Save Character'}
      </button>
    </div>
  )
}
