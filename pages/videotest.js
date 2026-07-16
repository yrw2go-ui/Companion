// pages/videotest.js

import { useState } from 'react'

const MODELS = [
  {
    label: 'WAN 2.2 Turbo Spicy',
    value: 'atlascloud/wan-2.2-turbo-spicy/image-to-video',
  },
  {
    label: 'WAN 2.6 Spicy',
    value: 'atlascloud/wan-2.6-spicy/image-to-video',
  },
  {
    label: 'WAN 2.2',
    value: 'atlascloud/wan-2.2/image-to-video',
  },
  {
    label: 'Seedance v1.5 Pro',
    value: 'bytedance/seedance-v1.5-pro/image-to-video-spicy',
  },
]

export default function VideoTest() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState(
    'gentle natural motion, subtle movement, slight breeze'
  )

  const [model, setModel] = useState(MODELS[0].value)
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')

  const [loading, setLoading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [result, setResult] = useState('')

  async function generate() {
    if (!imageUrl) {
      alert('Please enter an image URL')
      return
    }

    setLoading(true)
    setVideoUrl('')
    setResult('')

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl,
          prompt,
          model,
          duration,
          resolution,
        }),
      })

      const data = await res.json()

      if (data.videoUrl) {
        setVideoUrl(data.videoUrl)
      } else {
        setResult(JSON.stringify(data, null, 2))
      }
    } catch (err) {
      setResult(err.message)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white max-w-xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        AtlasCloud Video Test
      </h1>

      <label className="block mb-2">
        Image URL
      </label>

      <input
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="https://..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4"
      />

      <label className="block mb-2">
        Video Model
      </label>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-4 mb-4">

        <div>
          <label className="block mb-2">
            Duration
          </label>

          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3"
          >
            <option value={5}>5 Seconds</option>
            <option value={10}>10 Seconds</option>
            <option value={15}>15 Seconds</option>
          </select>
        </div>

        <div>
          <label className="block mb-2">
            Resolution
          </label>

          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

      </div>

      <label className="block mb-2">
        Prompt
      </label>

      <textarea
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 mb-5"
      />

      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-bold"
      >
        {loading ? 'Generating Video...' : 'Generate Video'}
      </button>

      {videoUrl && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-3">
            Result
          </h2>

          <video
            controls
            autoPlay
            loop
            src={videoUrl}
            className="w-full rounded-lg"
          />
        </>
      )}

      {result && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-3">
            Response
          </h2>

          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs whitespace-pre-wrap break-all">
            {result}
          </pre>
        </>
      )}

    </div>
  )
}
