// pages/character/[id].js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

export default function CharacterHub() {
  const router = useRouter()
  const { id } = router.query
  const [character, setCharacter] = useState(null)
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  const load = async () => {
    const { data: char } = await supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single()
    setCharacter(char)

    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .eq('character_id', id)
      .order('created_at', { ascending: false })
    setConversations(convos || [])
    setLoading(false)
  }

  const startNew = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ character_id: id, scenario: '' }])
      .select()
      .single()
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    router.push(`/chat/${data.id}`)
  }

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">{character.name}</h1>
        <button onClick={() => router.push(`/edit/${id}`)} className="text-gray-400 hover:text-white text-sm">Edit</button>
      </div>

      <button
        onClick={startNew}
        className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold mb-6"
      >
        + Start New Conversation
      </button>

      <h2 className="text-sm text-gray-400 mb-3">Conversations</h2>

      {conversations.length === 0 ? (
        <p className="text-gray-600 text-sm">No conversations yet. Start one above.</p>
      ) : (
        <div className="space-y-3">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/chat/${c.id}`)}
              className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-4"
            >
              <div className="text-sm text-gray-300">
                {new Date(c.created_at).toLocaleString()}
              </div>
              {c.summary && (
                <div className="text-xs text-gray-500 mt-1 truncate">{c.summary}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
