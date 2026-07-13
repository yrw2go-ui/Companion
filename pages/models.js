// pages/models.js
import { useState, useEffect } from 'react'

export default function Models() {
  const [result, setResult] = useState('Loading...')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/list-models')
      .then(r => r.json())
      .then(d => setResult(d))
      .catch(e => setResult({ error: e.message }))
  }, [])

  if (typeof result === 'string') {
    return <div className="min-h-screen bg-black text-white p-5">{result}</div>
  }

  const models = result.models || []
  const shown = filter
    ? models.filter(m => m.toLowerCase().includes(filter.toLowerCase()))
    : models

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Atlas Models</h1>
      <p className="text-xs text-gray-500 mb-4">{result.count ?? 0} available</p>

      {result.error && (
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap break-all mb-4">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="filter... e.g. deepseek, qwen, glm"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500"
      />

      <div className="space-y-1">
        {shown.map(m => (
          <div
            key={m}
            onClick={() => navigator.clipboard?.writeText(m)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono break-all active:bg-gray-800"
          >
            {m}
          </div>
        ))}
      </div>

      {shown.length === 0 && !result.error && (
        <p className="text-gray-600 text-sm">No matches.</p>
      )}
    </div>
  )
}
