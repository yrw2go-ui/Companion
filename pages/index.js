// pages/index.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const router = useRouter()
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCharacters()
  }, [])

  const loadCharacters = async () => {
    const { data } = await supabase
      .from('characters')
      .select('*')
      .order('created_at', { ascending: false })
    setCharacters(data || [])
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Companion</h1>
        <button
          onClick={() => router.push('/create')}
          className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold"
        >
          + New
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : characters.length === 0 ? (
        <p className="text-gray-500">No characters yet. Tap "+ New" to create one.</p>
      ) : (
        <div className="space-y-3">
          {characters.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/chat/${c.id}`)}
              className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-4"
            >
              <div className="font-semibold text-lg">{c.name}</div>
              {c.personality && (
                <div className="text-sm text-gray-400 truncate">{c.personality}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
