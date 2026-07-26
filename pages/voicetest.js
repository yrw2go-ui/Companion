// pages/voicetest.js
// Browse and preview TTS voices so you can find ones worth using,
// since most of Atlas's 80+ voice IDs have no human-readable name.
import { useState } from 'react'

// the 5 named, multilingual voices from the docs
const NAMED_VOICES = [
  { id: 'eve', label: 'Eve — female, energetic' },
  { id: 'ara', label: 'Ara — female, warm' },
  { id: 'leo', label: 'Leo — male, authoritative' },
  { id: 'rex', label: 'Rex — male, professional' },
  { id: 'sal', label: 'Sal — neutral, versatile' },
]

// the remaining ids from the schema have no label — just opaque codes.
// list them so they can still be tried and identified by ear.
const UNLABELED_VOICE_IDS = [
  'jpi39icg','d18jlf6v','33g9t0jl','26w6ihxi','dr8gqysu','wy0m9l5w','om17cury','x7avnu1k',
  'bcs7l2c3','hqxr4yub','h27ltdnz','89q2pnko','73xd5dum','0p0rt7o1','hbxkrnwm','69smp8rm',
  'yis75yfp','ekhwx401','jupvcf34','0hhfxxqq','0ih5oi34','gwnexu6y','97zmdc6s',
  'fc7de6afcf6c','7a9ee820b342','0895a5b8ce5c','f8cf5c2c78d4','96819d0bd28d','79f3a8b96d43',
  '78a495fdbb39','e22152e06fd8','490ea3be50b1','1f046a033914','dfe7b9e7d217','c3a2c594479e',
  '83c6f4fea98e','34fd4dce1ba3','d634b6da3d3b','670a0c3ac005','182a91893636','d0cb9ff07d95',
  'b1a7441b97a1','bf9fe5b5f981','b5ae17439907','a0401c9101f8','23be42535a45','abfbdf26f115',
  '6da5baee46d0','3d030bc92a87','a13662ba951c','58d27475085e','247783ebdd51','244e27b39200',
  '97fabd54445f','37329fd8895a','2badb5f46b1e','1b12d5daee6b','908c4626660f','4ff93971bfdc',
  '70013edeb8e8','35c8d7f60dc8','23468361b4ef','458705c07139','41321eb41295','40f31906b23d',
  '3a7889066fa2',
]

export default function VoiceTest() {
  const [text, setText] = useState("Hi, daddy! I've been thinking about you. I miss you.")
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(null)   // voiceId currently generating
  const [results, setResults] = useState({})     // voiceId -> { url, label }
  const [favorites, setFavorites] = useState([])
  const [showUnlabeled, setShowUnlabeled] = useState(false)

  const tryVoice = async (voiceId, label) => {
    if (playing) return
    setPlaying(voiceId)
    try {
      const res = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, speed }),
      })
      const data = await res.json()
      if (data.audioUrl) {
        setResults(prev => ({ ...prev, [voiceId]: { url: data.audioUrl, label } }))
        const audio = new Audio(data.audioUrl)
        audio.play()
      } else {
        alert('Error: ' + (data.error || 'failed'))
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setPlaying(null)
  }

  const toggleFavorite = (voiceId) => {
    setFavorites(prev => prev.includes(voiceId) ? prev.filter(v => v !== voiceId) : [...prev, voiceId])
  }

  const voiceRow = (voiceId, label) => (
    <div key={voiceId} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3 mb-2">
      <button
        onClick={() => tryVoice(voiceId, label)}
        disabled={playing === voiceId}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg px-3 py-2 text-sm font-semibold shrink-0"
      >
        {playing === voiceId ? '...' : '▶'}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{label}</p>
        <p className="text-[10px] text-gray-600 font-mono">{voiceId}</p>
      </div>
      {results[voiceId] && (
        <button onClick={() => new Audio(results[voiceId].url).play()}
          className="text-gray-400 hover:text-white text-xs shrink-0">Replay</button>
      )}
      <button onClick={() => toggleFavorite(voiceId)} className="shrink-0 text-lg">
        {favorites.includes(voiceId) ? '★' : '☆'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Voice Browser</h1>
      <p className="text-xs text-gray-500 mb-4">
        Preview TTS voices with your own sample line. Star the ones you like — use their ID in a character's voice field.
      </p>

      <label className="block text-xs text-gray-400 mb-1">Sample Text</label>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />

      <label className="block text-xs text-gray-400 mb-1">Speed: {speed}x</label>
      <input type="range" min="0.7" max="1.5" step="0.05" value={speed}
        onChange={e => setSpeed(parseFloat(e.target.value))}
        className="w-full mb-5 accent-purple-500" />

      {favorites.length > 0 && (
        <>
          <h2 className="font-semibold text-sm mb-2">★ Your Favorites</h2>
          {favorites.map(id => {
            const named = NAMED_VOICES.find(v => v.id === id)
            return voiceRow(id, named ? named.label : id)
          })}
          <div className="border-t border-gray-800 my-4" />
        </>
      )}

      <h2 className="font-semibold text-sm mb-2">Named Voices</h2>
      {NAMED_VOICES.map(v => voiceRow(v.id, v.label))}

      <button
        onClick={() => setShowUnlabeled(v => !v)}
        className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2.5 text-sm text-gray-400 mt-3 mb-2"
      >
        {showUnlabeled ? 'Hide' : 'Show'} {UNLABELED_VOICE_IDS.length} unlabeled voices
      </button>
      <p className="text-[10px] text-gray-600 mb-3">
        These have no name from Atlas, just an ID. Try them and star the ones worth keeping.
      </p>

      {showUnlabeled && UNLABELED_VOICE_IDS.map(id => voiceRow(id, 'Unlabeled voice'))}
    </div>
  )
}
