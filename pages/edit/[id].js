// pages/edit/[id].js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

const VOICES = [
  { id: 'eve', label: 'Eve — female, energetic' },
  { id: 'ara', label: 'Ara — female, warm' },
  { id: 'leo', label: 'Leo — male, authoritative' },
  { id: 'rex', label: 'Rex — male, professional' },
  { id: 'sal', label: 'Sal — neutral, versatile' },
]

const MODELS = [
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro — strong all-round (default)' },
  { id: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash — faster, cheaper' },
  { id: 'deepseek-ai/deepseek-v3.2', label: 'DeepSeek V3.2 — previous gen' },
  { id: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max — flagship, best reasoning' },
  { id: 'qwen/qwen3.5-plus', label: 'Qwen 3.5 Plus — strong, balanced' },
  { id: 'qwen/qwen3.5-27b', label: 'Qwen 3.5 27B — mid-size, quick' },
  { id: 'zai-org/glm-5', label: 'GLM 5 — natural dialogue' },
  { id: 'zai-org/glm-4.7', label: 'GLM 4.7 — natural dialogue, cheaper' },
  { id: 'minimaxai/minimax-m3', label: 'MiniMax M3 — fast, lightweight' },
  { id: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6 — long context' },
  { id: 'xai/grok-4.5', label: 'Grok 4.5 — casual, less filtered' },
]

const IMAGE_MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux' },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux' },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell' },
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok' },
]
const familyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

const AV_NEGATIVE = 'blurry, (Asian), big hips, wide hips, mature woman, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

export default function EditCharacter() {
  const router = useRouter()
  const { id } = router.query
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '', age: '', appearance: '', personality: '',
    speaking_style: '', backstory: '', relationship: '', sample_dialogue: '',
    response_rules: '', image_style: '', voice_id: 'eve', voice_speed: 1, chat_model: 'deepseek-ai/deepseek-v4-pro',
    user_appearance_override: '',
  })
  const [memories, setMemories] = useState([])
  const [newMemory, setNewMemory] = useState('')

  const [imageModel, setImageModel] = useState('z-image/turbo')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarNegative, setAvatarNegative] = useState(AV_NEGATIVE)
  const [avatarSeed, setAvatarSeed] = useState(null)
  const [genning, setGenning] = useState(false)
  const [showAvatarInfo, setShowAvatarInfo] = useState(false)

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  const load = async () => {
    const { data } = await supabase.from('characters').select('*').eq('id', id).single()
    if (data) {
      setForm({
        name: data.name || '',
        age: data.age || '',
        appearance: data.appearance || '',
        personality: data.personality || '',
        speaking_style: data.speaking_style || '',
        backstory: data.backstory || '',
        relationship: data.relationship || '',
        sample_dialogue: data.sample_dialogue || '',
        response_rules: data.response_rules || '',
        image_style: data.image_style || '',
        voice_id: data.voice_id || 'eve',
        voice_speed: data.voice_speed ?? 1,
        chat_model: data.chat_model || 'deepseek-ai/deepseek-v4-pro',
        user_appearance_override: data.user_appearance_override || '',
      })
      setAvatarUrl(data.avatar_url || '')
      setImageModel(data.image_model || 'z-image/turbo')
    }
    await loadMemories()
    setLoading(false)
  }

  const loadMemories = async () => {
    const { data } = await supabase
      .from('core_memories')
      .select('*')
      .eq('character_id', id)
      .order('created_at', { ascending: true })
    setMemories(data || [])
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
    if (!promptToUse) { alert('Add an appearance or type an avatar prompt first'); return }
    setGenning(true)
    setAvatarUrl('')
    try {
      const fam = familyOf(imageModel)
      const payload = { model: imageModel, prompt: promptToUse }
      if (fam === 'grok') { payload.aspectRatio = '3:4'; payload.resolution = '2k' }
      else if (fam === 'seedream') { payload.size = '1328*1776'; payload.thinking = 'disabled' }
      else if (fam === 'schnell') { payload.size = '768*1024'; payload.negativePrompt = avatarNegative }
      else { payload.size = '768*1024'; payload.negativePrompt = avatarNegative; payload.guidance = 3.5; payload.steps = 28 }

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
        character_id: id || null,
      }])
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setGenning(false)
  }

  const update = (field, value) => setForm({ ...form, [field]: value })

  const save = async () => {
    if (!form.name.trim()) {
      alert('Please give your character a name')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('characters')
      .update({
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        appearance: form.appearance,
        personality: form.personality,
        speaking_style: form.speaking_style,
        backstory: form.backstory,
        relationship: form.relationship,
        sample_dialogue: form.sample_dialogue,
        response_rules: form.response_rules,
        image_style: form.image_style,
        voice_id: form.voice_id,
        voice_speed: form.voice_speed,
        chat_model: form.chat_model,
        user_appearance_override: form.user_appearance_override,
        avatar_url: avatarUrl || null,
        image_model: imageModel,
      })
      .eq('id', id)
    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    router.push(`/character/${id}`)
  }

  const del = async () => {
    if (!confirm('Delete this character permanently?')) return
    await supabase.from('characters').delete().eq('id', id)
    router.push('/')
  }

  const addMemory = async () => {
    if (!newMemory.trim()) return
    await supabase.from('core_memories').insert([{ character_id: id, memory: newMemory }])
    setNewMemory('')
    loadMemories()
  }

  const updateMemory = async (memId, text) => {
    await supabase.from('core_memories').update({ memory: text }).eq('id', memId)
    loadMemories()
  }

  const deleteMemory = async (memId) => {
    await supabase.from('core_memories').delete().eq('id', memId)
    loadMemories()
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

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push(`/character/${id}`)} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Edit Character</h1>
        <span className="w-12"></span>
      </div>

      {field('Name', 'name', 'e.g. Aria')}
      {field('Age', 'age', 'e.g. 28')}
      {field('Appearance', 'appearance', 'How they look', true)}
      {field('Personality', 'personality', 'Witty, warm, sarcastic...', true)}
      {field('Speaking Style', 'speaking_style', 'Casual, poetic, blunt...', true)}
      {field('Backstory', 'backstory', 'Their history', true)}
      {field('Relationship to You', 'relationship', 'Friend, partner, mentor...', true)}
      {field('Response Rules', 'response_rules', 'Keep replies to 2 paragraphs or less. Do not repeat yourself.', true)}
      {field('Image Style', 'image_style', 'e.g. photorealistic portrait  OR  anime style', true)}
      {field('How I Appear To Them', 'user_appearance_override', 'Overrides your global description for this character', true)}

      {/* Avatar */}
      <div className="border-t border-gray-800 pt-5 mt-2 mb-4">
        <h2 className="font-semibold mb-1">Avatar</h2>
        <p className="text-xs text-gray-600 mb-3">Generate a portrait to use as this character's thumbnail. Also sets the default image model.</p>

        <label className="block text-sm text-gray-400 mb-1">Image Model</label>
        <select value={imageModel} onChange={e => setImageModel(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-1 text-white focus:border-purple-500 outline-none">
          {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-[10px] text-gray-600 mb-3">
          {familyOf(imageModel) === 'seedream' && 'Highest resolution. No seed or negative prompt.'}
          {familyOf(imageModel) === 'grok' && 'Stylized. No seed or negative prompt.'}
          {familyOf(imageModel) === 'schnell' && 'Fast, lower cost. Uses negative prompt.'}
          {familyOf(imageModel) === 'flux' && 'Balanced. Uses negative prompt.'}
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

        {(familyOf(imageModel) === 'flux' || familyOf(imageModel) === 'schnell') && (
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
            <img src={avatarUrl} alt="avatar" onClick={() => setShowAvatarInfo(v => !v)}
              className="w-32 h-40 object-cover rounded-lg border border-gray-700 cursor-pointer" />
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

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Chat Model</label>
        <select
          value={form.chat_model}
          onChange={e => update('chat_model', e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-600 mt-1">Which AI drives this character's replies.</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Voice</label>
        <select
          value={form.voice_id}
          onChange={e => update('voice_id', e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        >
          {VOICES.map(v => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>

        <label className="block text-xs text-gray-400 mt-3 mb-1">Speed: {form.voice_speed}x</label>
        <input type="range" min="0.7" max="1.5" step="0.05" value={form.voice_speed}
          onChange={e => update('voice_speed', parseFloat(e.target.value))}
          className="w-full accent-purple-500" />
        <p className="text-[10px] text-gray-600 mt-1">0.7 = slower, 1.5 = faster. 1.0 is natural pace.</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Sample Conversations</label>
        <p className="text-xs text-gray-600 mb-2">Show how they talk. Use You and character name format.</p>
        <textarea
          value={form.sample_dialogue}
          onChange={e => update('sample_dialogue', e.target.value)}
          placeholder="You: Hey, how are you? Character: Better now that you're here."
          rows={6}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none font-mono text-sm"
        />
      </div>

      <div className="mb-6 border border-gray-800 rounded-xl p-4">
        <h2 className="font-semibold mb-1">Core Memories</h2>
        <p className="text-xs text-gray-600 mb-3">Facts they always remember about you and your world.</p>

        <div className="space-y-2 mb-3">
          {memories.length === 0 ? (
            <p className="text-sm text-gray-600">No memories yet.</p>
          ) : (
            memories.map(m => (
              <div key={m.id} className="flex gap-2 items-start">
                <textarea
                  defaultValue={m.memory}
                  onBlur={e => {
                    if (e.target.value !== m.memory) updateMemory(m.id, e.target.value)
                  }}
                  rows={2}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm"
                />
                <button onClick={() => deleteMemory(m.id)} className="text-red-500 hover:text-red-400 px-2 py-2 text-sm">✕</button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={newMemory}
            onChange={e => setNewMemory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMemory()}
            placeholder="Add a memory..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm"
          />
          <button onClick={addMemory} className="bg-purple-600 hover:bg-purple-700 rounded-lg px-4 text-sm font-semibold">Add</button>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mt-2"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <button onClick={del} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-3 font-semibold mt-3">
        Delete Character
      </button>
    </div>
  )
}
