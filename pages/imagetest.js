// pages/imagetest.js
import { useState } from 'react'

export default function ImageTest() {
  const [prompt, setPrompt] = useState('portrait of a petite young young with light brown hair posing in a highcut thong, soft lighting, digital art')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setResult('Error: ' + err.message)
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
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>
      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all overflow-auto">
          {result}
        </pre>
      )}
    </div>
  )
}
