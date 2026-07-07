// pages/chat/[id].js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

export default function Chat() {
  const router = useRouter()
  const { id } = router.query
  const [character, setCharacter] = useState(null)
  const [coreMemories, setCoreMemories] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!id) return
    loadCharacter()
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadCharacter = async () => {
    const { data: char } = await supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single()
    setCharacter(char)

    const { data: mems } = await supabase
      .from('core_memories')
      .select('*')
      .eq('character_id', id)
    setCoreMemories(mems || [])
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          coreMemories,
          scenario: '',
          messages: newMessages,
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }])
      } else {
        setMessages([...newMessages, { role: 'assistant', content: '[Error: ' + (data.error || 'no response') + ']' }])
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: '[Error: ' + err.message + ']' }])
    }
    setLoading(false)
  }

  if (!character) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col max-w-lg mx-auto">
      <div className="p-4 border-b border-gray-800 font-bold text-lg">
        {character.name}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              m.role === 'user'
                ? 'bg-purple-600 ml-auto'
                : 'bg-gray-800 mr-auto'
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-800 mr-auto rounded-2xl px-4 py-2 text-gray-400">
            {character.name} is typing...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-800 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 outline-none focus:border-purple-500"
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-full px-5 font-semibold"
        >
          Send
        </button>
      </div>
    </div>
  )
            }
