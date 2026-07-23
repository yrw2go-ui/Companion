// pages/imagetest.js
import { useState } from 'react'

const DEFAULT_NEGATIVE = 'blurry, big hips, wide hips, mature woman, unattractive female,low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

export default function ImageTest() {
  const [prompt, setPrompt] = useState('portrait of a petite young lady with light brown hair posing in a highcut thong, soft lighting, digital art')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, negativePrompt: negative }),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: err.message })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Image Test (Debug)</h1>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />
      <textarea
        value={negative}
        onChange={e => setNegative(e.target.value)}
        rows={2}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
        placeholder="Negative prompt"
      />
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>
      {result && (
        <div>
          {result.imageUrl ? (
            <img src={result.imageUrl} alt="Generated" className="w-full rounded-lg" />
          ) : (
            <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
