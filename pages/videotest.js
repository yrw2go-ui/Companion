// pages/videotest.js
import { useState } from 'react'

const MODELS = {
  wanTurbo: 'Wan 2.2 Turbo Spicy',
  wanLora: 'Wan 2.2 Turbo Spicy LoRA',
  wan26: 'Wan 2.6 Spicy',
  seedance: 'Seedance v1.5 Pro Spicy',
};

export default function VideoTest() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('gentle natural motion, subtle movement, slight breeze')
  const [modelKey, setModelKey] = useState('wanTurbo')
  const [videoUrl, setVideoUrl] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    setResult('')
    setVideoUrl('')
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt, modelKey }),
      })
      const data = await res.json()
      if (data.videoUrl) {
        setVideoUrl(data.videoUrl)
      } else {
        setResult(JSON.stringify(data, null, 2))
      }
    } catch (err) {
      setResult('Error: ' + err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Video Test</h1>
      <select value={modelKey} onChange={e => setModelKey(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3">
        {Object.entries(MODELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <input
        value={imageUrl}
        onChange={e => setImageUrl(e.target.value)}
        placeholder="https://...supabase.../character-images/img_xxx.jpeg"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm"
      />
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={2}
        placeholder="motion prompt"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating (can take 1-2 min)...' : 'Generate Video'}
      </button>
      {videoUrl && (
        <video controls autoPlay loop src={videoUrl} className="w-full rounded-lg mb-4" />
      )}
      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  )
}
