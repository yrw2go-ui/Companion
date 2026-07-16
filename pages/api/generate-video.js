// pages/videotest.js
import { useState } from 'react'

export default function VideoTest() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('gentle natural motion, sensual movement')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
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
        body: JSON.stringify({ imageUrl, prompt, duration, resolution }),
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

      <label className="block text-xs text-gray-400 mb-1">Image URL (from your Supabase bucket)</label>
      <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
        placeholder="https://...supabase.../character-images/img_xxx.jpeg"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

      <label className="block text-xs text-gray-400 mb-1">Motion Prompt</label>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

      <label className="block text-xs text-gray-400 mb-1">Length</label>
      <select value={duration} onChange={e => setDuration(parseInt(e.target.value))}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
        <option value={5}>5 seconds</option>
        <option value={8}>8 seconds</option>
        <option value={10}>10 seconds</option>
        <option value={15}>15 seconds</option>
      </select>

      <label className="block text-xs text-gray-400 mb-1">Resolution</label>
      <select value={resolution} onChange={e => setResolution(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-4 text-sm">
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
      </select>

      <button onClick={generate} disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4">
        {loading ? 'Generating (1-3 min)...' : 'Generate Video'}
      </button>

      {videoUrl && <video controls autoPlay loop src={videoUrl} className="w-full rounded-lg mb-4" />}

      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  )
}
