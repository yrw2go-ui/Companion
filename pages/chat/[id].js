// pages/chat/[id].js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

export default function Chat() {
  const router = useRouter()
  const { id } = router.query // this is now a CONVERSATION id
  const [conversation, setConversation] = useState(null)
  const [character, setCharacter] = useState(null)
  const [coreMemories, setCoreMemories] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ending, setEnding] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const load = async () => {
    const { data: convo } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single()
    if (!convo) return
    setConversation(convo)

    const { data: char } = await supabase
      .from('characters')
      .select('*')
      .eq('id', convo.character_id)
      .single()
    setCharacter(char)

    const { data: mems } = await supabase
      .from('core_memories')
      .select('*')
      .eq('character_id', convo.character_id)
    setCoreMemories(mems || [])

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // save user message
    await supabase.from('messages').insert([{
      conversation_id: id,
      role: 'user',
      content: userMsg.content,
    }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          coreMemories,
          scenario: conversation?.scenario || '',
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const replyText = data.reply || '[Error: ' + (data.error || 'no response') + ']'
      setMessages([...newMessages, { role: 'assistant', content: replyText }])

      // save assistant message
      await supabase.from('messages').insert([{
        conversation_id: id,
        role: 'assistant',
        content: replyText,
      }])
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: '[Error: ' + err.message + ']' }])
    }
    setLoading(false)
  }

  const endAndSave = async () => {
    if (!confirm('End this conversation? Key moments will be saved to memory, then the conversation will be deleted.')) return
    setEnding(true)

    try {
      // summarize into core memories
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          characterName: character.name,
        }),
      })
      const data = await res.json()
      if (data.summary && data.summary.trim()) {
        await supabase.from('core_memories').insert([{
          character_id: character.id,
          memory: data.summary.trim(),
        }])
      }
    } catch (err) {
      // continue even if summary fails
    }

    // delete conversation (messages cascade delete)
    await supabase.from('conversations').delete().eq('id', id)
    setEnding(false)
    router.push(`/character/${character.id}`)
  }

  if (!character || !conversation) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col max-w-lg mx-auto">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <button
          onClick={() => router.push(`/character/${character.id}`)}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back
        </button>
        <span className="font-bold text-lg">{character.name}</span>
        <button
          onClick={endAndSave}
          disabled={ending}
          className="text-gray-400 hover:text-white text-sm"
        >
          {ending ? 'Saving...' : 'End'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-8">
            Say something to start the conversation.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${
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
