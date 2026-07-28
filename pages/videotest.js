// pages/videotest.js
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { makePoster } from '../lib/posterFrame'

const MODELS = [
  { label: 'Wan 2.6 (5-15s)', value: 'alibaba/wan-2.6/image-to-video' },
  { label: 'Wan 2.2 Turbo (fast, 5s)', value: 'atlascloud/wan-2.2-turbo/image-to-video' },
  { label: 'Grok Imagine (up to 1080p)', value: 'xai/grok-imagine-video-v1.5/image-to-video' },
  { label: 'Wan 2.7 (start/end/continue)', value: 'alibaba/wan-2.7/image-to-video' },
  { label: 'Wan 2.2 Spicy (LoRA support)', value: 'alibaba/wan-2.2-spicy/image-to-video-lora' },
  { label: 'Wan 2.2 Spicy', value: 'atlascloud/wan-2.2-turbo-spicy/image-to-video' },
  { label: 'Wan 2.7 Spicy', value: 'atlascloud/wan-2.7-spicy/image-to-video' },
  { label: 'Seedance Spicy I2V', value: 'bytedance/seedance-v1.5-pro/image-to-video-spicy' },
]

export default function VideoTest() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('smooth natural motion, sensual movement, eyes blinking naturally')
  const [model, setModel] = useState(MODELS[0].value)
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [highNoiseLoras, setHighNoiseLoras] = useState('')
  const [lowNoiseLoras, setLowNoiseLoras] = useState('')
  const [loading, setLoading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [result, setResult] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isLoraModel = model === 'alibaba/wan-2.2-spicy/image-to-video-lora'

  // turn a textarea (one URL per line) into a clean array of strings
  const parseLoras = (text) =>
    text
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 3)

  async function generate() {
    if (!prompt) { alert('Please enter a prompt'); return }
    setLoading(true)
    setVideoUrl('')
    setResult('')
    setSaved(false)
    try {
      const payload = {
        imageUrl: imageUrl || undefined,
        prompt,
        model,
        duration,
        resolution,
      }
      if (isLoraModel) {
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
      if (data.videoUrl) setVideoUrl(data.videoUrl)
      else setResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setResult(err.message)
    }
    setLoading(false)
  }

  const saveToGallery = async () => {
    if (!videoUrl || saving) return
    setSaving(true)
    const poster = await makePoster(videoUrl)
    const { error } = await supabase.from('gallery_media').insert([{
      type: 'video', url: videoUrl, prompt, poster_url: poster,
    }])
    setSaving(false)
    if (error) { alert('Save failed: ' + error.message); return }
    setSaved(true)
  }

  return (
    <div className="min-h-screen bg-black text-white max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">AtlasCloud Video Test</h1>

      <label className="block mb-2">Image URL (optional for T2V)</label>
      <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://... (leave blank for T2V)" className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4" />

      <label className="block mb-2">Video Model</label>
      <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4">
        {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {isLoraModel && (
        <div className="mb-4 space-y-3 border border-purple-900/50 rounded-lg p-3 bg-gray-950">
          <p className="text-xs text-purple-300">LoRA slots (one URL per line, max 3 each)</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">High-noise LoRAs</label>
            <textarea
              rows={2}
              value={highNoiseLoras}
              onChange={e => setHighNoiseLoras(e.target.value)}
              placeholder="https://.../lora.safetensors"
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Low-noise LoRAs</label>
            <textarea
              rows={2}
              value={lowNoiseLoras}
              onChange={e => setLowNoiseLoras(e.target.value)}
              placeholder="https://.../lora.safetensors"
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-sm"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block mb-2">Duration</label>
          <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3">
            <option value={5}>5 Seconds</option>
            <option value={8}>8 Seconds</option>
            <option value={10}>10 Seconds</option>
            <option value={15}>15 Seconds</option>
          </select>
        </div>
        <div>
          <label className="block mb-2">Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3">
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>
      </div>

      <label className="block mb-2">Prompt</label>
      <textarea rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-5" />

      <button onClick={generate} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-bold">
        {loading ? 'Generating Video...' : 'Generate Video'}
      </button>

      {videoUrl && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-3">Result</h2>
          <video controls preload="metadata" src={videoUrl} className="w-full rounded-lg" />
          <button onClick={saveToGallery} disabled={saving || saved} className="w-full bg-gray-800 hover:bg-gray-700 mt-4 rounded-lg py-3 font-bold">
            {saved ? 'Saved to Gallery' : saving ? 'Saving...' : 'Save to Gallery'}
          </button>
        </>
      )}

      {result && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-3">Response</h2>
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs whitespace-pre-wrap break-all">{result}</pre>
        </>
      )}
    </div>
  )
}
