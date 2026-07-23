// pages/imagetest.js
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image-Turbo', family: 'Turbo' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok' },
]

const FLUX_SIZES = [
  { value: '768*1024', label: 'Portrait 3:4' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
  { value: '1024*576', label: 'Wide 16:9' },
]

const GROK_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '1:2', '2:1']

const DEFAULT_NEGATIVE = 'blurry, (Asian), big hips, wide hips, mature woman, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

export default function ImageTest() {
  const [model, setModel] = useState(MODELS[0].id)
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [seed, setSeed] = useState('')
  const [size, setSize] = useState('768*1024')
  const [guidance, setGuidance] = useState(3.5)
  const [steps, setSteps] = useState(28)
  const [aspectRatio, setAspectRatio] = useState('2:3')
  const [resolution, setResolution] = useState('1k')
  const [imageUrl, setImageUrl] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const family = MODELS.find(m => m.id === model)?.family

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setResult('')
    setImageUrl('')
    setSaved(false)
    try {
      const res = await fetch('/api/generate-image-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, prompt,
          negativePrompt: negative,
          seed, size, guidance, steps,
          aspectRatio, resolution,
        }),
      })
      const data = await res.json()
      if (data.imageUrl) setImageUrl(data.imageUrl)
      else setResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setResult('Error: ' + err.message)
    }
    setLoading(false)
  }

  const saveToGallery = async () => {
    if (!imageUrl) return
    const { error } = await supabase.from('gallery_media').insert([{
      type: 'image', url: imageUrl, prompt,
    }])
    if (error) { alert('Save failed: ' + error.message); return }
    setSaved(true)
  }

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

      {family === 'flux' ? (
        <>
          <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
          <textarea value={negative} onChange={e => setNegative(e.target.value)} rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

          <label className="block text-xs text-gray-400 mb-1">Size</label>
          <select value={size} onChange={e => setSize(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            {FLUX_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <label className="block text-xs text-gray-400 mb-1">Guidance: {guidance}</label>
          <input type="range" min="1" max="10" step="0.5" value={guidance}
            onChange={e => setGuidance(parseFloat(e.target.value))}
            className="w-full mb-3 accent-purple-500" />

          <label className="block text-xs text-gray-400 mb-1">Steps: {steps}</label>
          <input type="range" min="10" max="50" step="1" value={steps}
            onChange={e => setSteps(parseInt(e.target.value))}
            className="w-full mb-3 accent-purple-500" />

          <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
          <input value={seed} onChange={e => setSeed(e.target.value)} placeholder="random if blank"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm" />
        </>
      ) : (
        <>
          <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
            {GROK_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label className="block text-xs text-gray-400 mb-1">Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm">
            <option value="1k">1K ($0.05)</option>
            <option value="2k">2K ($0.07)</option>
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
