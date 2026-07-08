// pages/audiotest.js
import { useState } from 'react'

export default function AudioTest() {
  const [text, setText] = useState('Hello, this is a test of my voice. How do I sound?')
  const [voice, setVoice] = useState('alloy')
  const [audioUrl, setAudioUrl] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    setResult('')
    setAudioUrl('')
    try {
      const res = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      })
      const data = await res.json()
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl)
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
      <h1 className="text-xl font-bold mb-4">Audio Test</h1>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />
      <input
        value={voice}
        onChange={e => setVoice(e.target.value)}
        placeholder="voice name"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3"
      />
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mb-4"
      >
        {loading ? 'Generating...' : 'Generate Speech'}
      </button>
      {audioUrl && (
        <audio controls src={audioUrl} className="w-full mb-4" />
      )}
      {result && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  )
}
