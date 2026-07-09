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
    label: 'WAN 2.1',
    value: 'atlascloud/wan-2.1/image-to-video',
  },
]

export default function VideoTest() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState(
    'gentle natural motion, subtle movement, slight breeze'
  )
  const [model, setModel] = useState(MODELS[0].value)
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl,
          prompt,
          model,
        }),
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

      <input
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="Image URL"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />

      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating...' : 'Generate Video'}
      </button>

      {videoUrl && (
        <video
          controls
          autoPlay
          loop
          src={videoUrl}
          className="w-full rounded-lg mb-4"
        />
      )}

      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  )
}
