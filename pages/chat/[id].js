// pages/chat/[id].js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'
import { buildImagePrompt } from '../../lib/buildImagePrompt'

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

export default function Chat() {
  const router = useRouter()
  const { id } = router.query
  const [conversation, setConversation] = useState(null)
  const [character, setCharacter] = useState(null)
  const [coreMemories, setCoreMemories] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ending, setEnding] = useState(false)
  const [imaging, setImaging] = useState(false)
  const [userDescription, setUserDescription] = useState('')
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [negativeText, setNegativeText] = useState(DEFAULT_NEGATIVE)
  const [seedText, setSeedText] = useState('')
  const [autoPlay, setAutoPlay] = useState(false)
  const [speakingIdx, setSpeakingIdx] = useState(null)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoPrompt, setVideoPrompt] = useState('gentle natural motion, subtle movement')
  const [videoSourceUrl, setVideoSourceUrl] = useState('')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoRes, setVideoRes] = useState('720p')
  const [videoing, setVideoing] = useState(false)
  const audioRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const load = async () => {
    const { data: convo } = await supabase.from('conversations').select('*').eq('id', id).single()
    if (!convo) return
    setConversation(convo)

    const { data: char } = await supabase.from('characters').select('*').eq('id', convo.character_id).single()
    setCharacter(char)

    const { data: mems } = await supabase.from('core_memories').select('*').eq('character_id', convo.character_id)
    setCoreMemories(mems || [])

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])

    if (char?.user_appearance_override) {
      setUserDescription(char.user_appearance_override)
    } else {
      const { data: settings } = await supabase.from('user_settings').select('my_description').eq('id', 1).single()
      setUserDescription(settings?.my_description || '')
    }
  }

  const speak = async (text, idx) => {
    if (!character?.voice_id) return
    const spokenOnly = text.replace(/\*[^*]+\*/g, '').trim()
    if (!spokenOnly) return
    setSpeakingIdx(idx)
    try {
      const res = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenOnly, voiceId: character.voice_id }),
      })
      const data = await res.json()
      if (data.audioUrl && audioRef.current) {
        audioRef.current.src = data.audioUrl
        audioRef.current.play()
      }
    } catch (err) {}
    setSpeakingIdx(null)
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    await supabase.from('messages').insert([{ conversation_id: id, role: 'user', content: userMsg.content }])

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
      const withReply = [...newMessages, { role: 'assistant', content: replyText }]
      setMessages(withReply)

      await supabase.from('messages').insert([{ conversation_id: id, role: 'assistant', content: replyText }])

      if (autoPlay && !replyText.startsWith('[Error')) {
        speak(replyText, withReply.length - 1)
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: '[Error: ' + err.message + ']' }])
    }
    setLoading(false)
  }

  const openPromptModal = (includeUser) => {
    const recent = messages.filter(m => m.role !== 'image' && m.role !== 'video').slice(-4).map(m => m.content).join(' ')
    const sceneContext = recent ? `current scene: ${recent.slice(0, 300)}` : ''
    setPromptText(buildImagePrompt(character, sceneContext, includeUser, userDescription))
    setNegativeText(DEFAULT_NEGATIVE)
    setSeedText('')
    setShowPromptModal(true)
  }

  const confirmGenerate = async () => {
    setShowPromptModal(false)
    if (imaging) return
    setImaging(true)

    setMessages(prev => [...prev, { role: 'image', content: 'generating' }])

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          negativePrompt: negativeText,
          seed: seedText || undefined,
        }),
      })
      const data = await res.json()
      if (data.imageUrl) {
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'image', content: data.imageUrl, seed: data.seed }
          return copy
        })
        await supabase.from('messages').insert([{
          conversation_id: id,
          role: 'image',
          content: data.imageUrl,
          seed: data.seed,
          prompt: promptText,
          negative_prompt: negativeText,
          size: data.size,
        }])
      } else {
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: '[Image error: ' + (data.error || 'failed') + ']' }
          return copy
        })
      }
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: '[Image error: ' + err.message + ']' }
        return copy
      })
    }
    setImaging(false)
  }

  const openVideoModal = (imageUrl) => {
    setVideoSourceUrl(imageUrl)
    setVideoPrompt('gentle natural motion, subtle movement')
    setVideoDuration(5)
    setVideoRes('720p')
    setShowVideoModal(true)
  }

  const confirmVideo = async () => {
    setShowVideoModal(false)
    if (videoing) return
    setVideoing(true)

    setMessages(prev => [...prev, { role: 'video', content: 'generating' }])

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: videoSourceUrl, prompt: videoPrompt, duration: videoDuration, resolution: videoRes }),
      })
      const data = await res.json()
      if (data.videoUrl) {
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'video', content: data.videoUrl }
          return copy
        })
        await supabase.from('messages').insert([{
          conversation_id: id,
          role: 'video',
          content: data.videoUrl,
          prompt: videoPrompt,
        }])
      } else {
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: '[Video error: ' + (data.error || 'failed') + ']' }
          return copy
        })
      }
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: '[Video error: ' + err.message + ']' }
        return copy
      })
    }
    setVideoing(false)
  }

  const fileNameFromUrl = (url) => url.split('/character-images/')[1] || null

  const deleteMedia = async (mediaUrl, role) => {
    setMessages(prev => prev.filter(m => !(m.role === role && m.content === mediaUrl)))
    await supabase.from('messages').delete().eq('conversation_id', id).eq('role', role).eq('content', mediaUrl)
    const fileName = fileNameFromUrl(mediaUrl)
    if (fileName) await supabase.storage.from('character-images').remove([fileName])
  }

  const endAndSave = async () => {
    if (!confirm('End this conversation? Key moments will be saved to memory, then the conversation will be deleted.')) return
    setEnding(true)

    const mediaFiles = messages
      .filter(m => (m.role === 'image' || m.role === 'video') && m.content !== 'generating')
      .map(m => fileNameFromUrl(m.content))
      .filter(Boolean)
    if (mediaFiles.length > 0) {
      await supabase.storage.from('character-images').remove(mediaFiles)
    }

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.filter(m => m.role !== 'image' && m.role !== 'video').map(m => ({ role: m.role, content: m.content })),
          characterName: character.name,
        }),
      })
      const data = await res.json()
      if (data.summary && data.summary.trim()) {
        await supabase.from('core_memories').insert([{ character_id: character.id, memory: data.summary.trim() }])
      }
    } catch (err) {}

    await supabase.from('conversations').delete().eq('id', id)
    setEnding(false)
    router.push(`/character/${character.id}`)
  }

  const renderContent = (text) => {
    const parts = text.split(/(\*[^*]+\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <span key={i} className="italic text-gray-400">{part.slice(1, -1)}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  if (!character || !conversation) {
    return <div className="chat-frame bg-black text-white items-center justify-center">Loading...</div>
  }

  return (
    <div className="chat-frame bg-black text-white max-w-lg mx-auto">
      <audio ref={audioRef} className="hidden" />
      <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-black">
        <button onClick={() => router.push(`/character/${character.id}`)} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold text-lg">{character.name}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setAutoPlay(!autoPlay)} className={`text-sm ${autoPlay ? 'text-purple-400' : 'text-gray-500'}`} title="Toggle auto-play voice">
            {autoPlay ? '🔊' : '🔇'}
          </button>
          <button onClick={endAndSave} disabled={ending} className="text-gray-400 hover:text-white text-sm">
            {ending ? 'Saving...' : 'End'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-8">Say something to start the conversation.</p>
        )}
        {messages.map((m, i) => {
          if (m.role === 'image') {
            if (m.content === 'generating') {
              return <div key={i} className="bg-gray-800 mr-auto rounded-2xl px-4 py-2 text-gray-400">Generating image...</div>
            }
            return (
              <div key={i} className="relative max-w-[80%] mr-auto">
                <img src={m.content} alt="scene" className="w-full rounded-2xl" />
                <button onClick={() => deleteMedia(m.content, 'image')}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full w-7 h-7 flex items-center justify-center text-sm" title="Delete image">✕</button>
                <button onClick={() => openVideoModal(m.content)} disabled={videoing}
                  className="absolute bottom-2 right-2 bg-black/70 hover:bg-black disabled:opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center" title="Animate this image">🎬</button>
              </div>
            )
          }
          if (m.role === 'video') {
            if (m.content === 'generating') {
              return <div key={i} className="bg-gray-800 mr-auto rounded-2xl px-4 py-2 text-gray-400">Generating video (1-2 min)...</div>
            }
            return (
              <div key={i} className="relative max-w-[80%] mr-auto">
                <video src={m.content} controls loop className="w-full rounded-2xl" />
                <button onClick={() => deleteMedia(m.content, 'video')}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full w-7 h-7 flex items-center justify-center text-sm" title="Delete video">✕</button>
              </div>
            )
          }
          const isChar = m.role === 'assistant'
          return (
            <div key={i} className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${m.role === 'user' ? 'bg-purple-600 ml-auto' : 'bg-gray-800 mr-auto'}`}>
              {renderContent(m.content)}
              {isChar && !m.content.startsWith('[') && (
                <button onClick={() => speak(m.content, i)} disabled={speakingIdx === i}
                  className="ml-2 text-gray-400 hover:text-white text-xs align-middle" title="Play voice">
                  {speakingIdx === i ? '⏳' : '🔊'}
                </button>
              )}
            </div>
          )
        })}
        {loading && (
          <div className="bg-gray-800 mr-auto rounded-2xl px-4 py-2 text-gray-400">{character.name} is typing...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-800 flex gap-2 flex-shrink-0 bg-black">
        <button onClick={() => openPromptModal(false)} disabled={imaging}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-full px-3 text-lg" title="Image of the character">🎨</button>
        <button onClick={() => openPromptModal(true)} disabled={imaging}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-full px-3 text-lg" title="Image of us together">👥</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 outline-none focus:border-purple-500" />
        <button onClick={send} disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-full px-5 font-semibold">Send</button>
      </div>

      {showPromptModal && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-2">Edit Image Prompt</h2>
            <p className="text-xs text-gray-500 mb-3">Tweak the scene, outfit, or details before generating.</p>

            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea value={promptText} onChange={e => setPromptText(e.target.value)} rows={7}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-3" />

            <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
            <textarea value={negativeText} onChange={e => setNegativeText(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-3" />

            <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
            <input value={seedText} onChange={e => setSeedText(e.target.value)} placeholder="leave blank for random"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-4" />

            <div className="flex gap-2">
              <button onClick={() => setShowPromptModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={confirmGenerate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Generate</button>
            </div>
          </div>
        </div>
      )}

      {showVideoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-5 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Animate Image</h2>
            <p className="text-xs text-gray-500 mb-3">Takes 1-2 minutes and costs more than an image.</p>

            <img src={videoSourceUrl} alt="source" className="w-32 rounded-lg mb-3" />

            <label className="block text-xs text-gray-400 mb-1">Motion Prompt</label>
            <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-3" />

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={videoDuration} onChange={e => setVideoDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-3">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds (2x cost)</option>
              <option value={15}>15 seconds (3x cost)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={videoRes} onChange={e => setVideoRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-4">
              <option value="720p">720p</option>
              <option value="1080p">1080p (costs more)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowVideoModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={confirmVideo} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Animate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
