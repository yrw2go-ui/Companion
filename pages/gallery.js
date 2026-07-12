// pages/gallery.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Gallery() {
  const router = useRouter()
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .in('role', ['image', 'video'])
      .order('created_at', { ascending: false })

    const clean = (data || []).filter(m => m.content && m.content !== 'generating')
    setMedia(clean)
    setLoading(false)
  }

  const remove = async (item) => {
    if (!confirm('Delete this permanently?')) return
    await supabase.from('messages').delete().eq('id', item.id)
    const fileName = item.content.split('/character-images/')[1]
    if (fileName) {
      await supabase.storage.from('character-images').remove([fileName])
    }
    setSelected(null)
    load()
  }

  const shown = media.filter(m => {
    if (filter === 'all') return true
    if (filter === 'images') return m.role === 'image'
    if (filter === 'videos') return m.role === 'video'
    return true
  })

  const tab = (key, label) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
        filter === key ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Gallery</h1>
        <span className="w-12"></span>
      </div>

      <div className="flex gap-2 mb-5">
        {tab('all', 'All')}
        {tab('images', 'Images')}
        {tab('videos', 'Videos')}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-gray-500 text-sm">Nothing here yet. Generate images or videos in a chat.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map(item => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-900"
            >
              {item.role === 'image' ? (
                <img src={item.content} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video src={item.content} className="w-full h-full object-cover" muted />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded-full px-2 py-0.5 text-[10px]">
                    ▶ video
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-5 z-50"
          onClick={() => setSelected(null)}
        >
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            {selected.role === 'image' ? (
              <img src={selected.content} alt="" className="w-full rounded-2xl" />
            ) : (
              <video src={selected.content} controls autoPlay loop className="w-full rounded-2xl" />
            )}

            <p className="text-xs text-gray-500 mt-3 text-center">
              {new Date(selected.created_at).toLocaleString()}
            </p>

            <button
              onClick={() => remove(selected)}
              className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-3"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(null)}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
