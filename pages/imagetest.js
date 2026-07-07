// pages/imagetest.js
import { useState } from 'react'

export default function ImageTest() {
  const [prompt, setPrompt] = useState('portrait of a young woman with red hair, soft lighting, digital art')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setLoading(true)
    setError('')
    setImageUrl('')
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (data.imageUrl) {
        setImageUrl(data.imageUrl)
      } else {
        setError(data.error || 'No image returned')
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Image Test</h1>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p className="text-red-400 mb-4">Error: {error}</p>}
      {imageUrl && <img src={imageUrl} alt="generated" className="w-full rounded-lg" />}
    </div>
  )
      }
