// pages/media.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function MediaLibrary() {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | image | video | live | off
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editUnlock, setEditUnlock] = useState('shop')
  const [editCost, setEditCost] = useState('0')
  const [editEdition, setEditEdition] = useState('100')
  const [editChar, setEditChar] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('character_media')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setItems(data || [])
    setLoading(false)
  }

  const openItem = (m) => {
    setSelected(m)
    setEditTitle(m.title || '')
    setEditUnlock(m.unlock_method || 'shop')
    setEditCost(String(m.token_cost ?? 0))
    setEditEdition(String(m.edition_size ?? 100))
    setEditChar(m.character_name || '')
  }

  const togglePublish = async (m) => {
    const next = !m.published
    const { error } = await supabase.from('character_media').update({ published: next }).eq('id', m.id)
    if (error) { alert(error.message); return }
    setItems(prev => prev.map(x => x.id === m.id ? { ...x, published: next } : x))
    if (selected?.id === m.id) setSelected(s => ({ ...s, published: next }))
  }

  const saveEdit = async () => {
    if (!selected || busy) return
    setBusy(true)
    const payload = {
      title: editTitle.trim() || null,
      unlock_method: editUnlock,
      token_cost: parseInt(editCost) || 0,
      edition_size: parseInt(editEdition) || 100,
      character_name: editChar.trim() || selected.character_name,
    }
    const { data, error } = await supabase
      .from('character_media')
      .update(payload)
      .eq('id', selected.id)
      .select()
      .single()
    setBusy(false)
    if (error) { alert(error.message); return }
    setItems(prev => prev.map(x => x.id === selected.id ? data : x))
    setSelected(data)
    alert('Saved')
  }

  const deleteItem = async (m) => {
    if (!confirm('Delete this media? Edition stock will free up.')) return
    const { error } = await supabase.from('character_media').delete().eq('id', m.id)
    if (error) { alert(error.message); return }
    setItems(prev => prev.filter(x => x.id !== m.id))
    if (selected?.id === m.id) setSelected(null)
  }

  const visible = items.filter(m => {
    if (filter === 'image' && m.type !== 'image') return false
    if (filter === 'video' && m.type !== 'video') return false
    if (filter === 'live' && !m.published) return false
    if (filter === 'off' && m.published) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const hay = `${m.character_name || ''} ${m.title || ''} ${m.unlock_method || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // group by character for side list feel
  const byChar = {}
  for (const m of visible) {
    const k = m.character_name || 'Unlinked'
    if (!byChar[k]) byChar[k] = []
    byChar[k].push(m)
  }
  const charNames = Object.keys(byChar).sort((a, b) => a.localeCompare(b))

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
            <h1 className="text-xl font-bold">Media</h1>
            <span className="text-xs text-gray-500">{items.length} total</span>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => router.push('/gallery')} className="text-gray-400 hover:text-white">Gallery</button>
            <button onClick={() => router.push('/cards')} className="text-gray-400 hover:text-white">Cards</button>
            <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-white">Settings</button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Character media linked from cards. Publish (Live) to include in game media draws. Delete unlinks and frees edition slots.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search character or title..."
            className="flex-1 min-w-[160px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
          />
          {['all', 'image', 'video', 'live', 'off'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize ${filter === f ? 'bg-pink-600' : 'bg-gray-900 text-gray-400'}`}
            >
              {f}
            </button>
          ))}
          <button onClick={load} className="px-3 py-2 rounded-lg text-xs bg-gray-800 hover:bg-gray-700">Refresh</button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm py-12 text-center">Loading...</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            <p>No media yet.</p>
            <p className="mt-2 text-xs">Open a card → Create +media or paste a URL.</p>
            <button onClick={() => router.push('/cards')} className="mt-4 text-pink-400 hover:text-pink-300 text-sm font-semibold">
              Go to Cards →
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {charNames.map(name => (
              <div key={name}>
                <h2 className="text-sm font-semibold text-pink-300 mb-2 sticky top-0 bg-black/90 py-1 z-10">
                  {name}
                  <span className="text-gray-600 font-normal ml-2">{byChar[name].length}</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {byChar[name].map(m => (
                    <button
                      key={m.id}
                      onClick={() => openItem(m)}
                      className="text-left bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-pink-700 transition"
                    >
                      <div className="relative aspect-[3/4] bg-gray-800">
                        {m.type === 'video' ? (
                          <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded ${m.published ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                          {m.published ? 'Live' : 'Off'}
                        </span>
                        <span className="absolute bottom-2 left-2 text-[9px] bg-black/70 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          {m.type}
                        </span>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold truncate">{m.title || m.type}</p>
                        <p className="text-[10px] text-gray-500">{m.unlock_method} · ed. {m.edition_size || '—'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => setSelected(null)}>
          <div
            className="bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold">Media detail</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black mb-4">
              {selected.type === 'video' ? (
                <video src={selected.url} controls className="w-full max-h-[50vh]" playsInline />
              ) : (
                <img src={selected.url} alt="" className="w-full max-h-[50vh] object-contain" />
              )}
            </div>

            <label className="block text-xs text-gray-500 mb-1">Character name</label>
            <input value={editChar} onChange={e => setEditChar(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />

            <label className="block text-xs text-gray-500 mb-1">Title</label>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unlock</label>
                <select value={editUnlock} onChange={e => setEditUnlock(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-2 py-2 text-xs outline-none">
                  <option value="shop">Shop</option>
                  <option value="pack">Pack</option>
                  <option value="mine">Mine</option>
                  <option value="trade">Trade</option>
                  <option value="battle">Battle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cost</label>
                <input value={editCost} onChange={e => setEditCost(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-2 py-2 text-xs outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Edition</label>
                <input value={editEdition} onChange={e => setEditEdition(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-2 py-2 text-xs outline-none" />
              </div>
            </div>

            <p className="text-[10px] text-gray-600 mb-3 break-all">URL: {selected.url}</p>
            {selected.card_id && (
              <p className="text-[10px] text-gray-600 mb-3">Source card: {selected.card_id}</p>
            )}

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => togglePublish(selected)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold ${selected.published ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {selected.published ? 'Live ✓' : 'Set Live'}
              </button>
              <button onClick={saveEdit} disabled={busy}
                className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg py-3 text-sm font-semibold">
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
            <button onClick={() => deleteItem(selected)}
              className="w-full bg-red-900/80 hover:bg-red-800 rounded-lg py-3 text-sm font-semibold">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
