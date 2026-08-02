// pages/media.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function MediaLibrary() {
  const router = useRouter()
  const [library, setLibrary] = useState('character') // character | misc
  const [items, setItems] = useState([])
  const [miscItems, setMiscItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | image | video | live | off
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedKind, setSelectedKind] = useState('character') // character | misc
  const [busy, setBusy] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editUnlock, setEditUnlock] = useState('shop')
  const [editCost, setEditCost] = useState('0')
  const [editEdition, setEditEdition] = useState('100')
  const [editChar, setEditChar] = useState('')
  const [editOverlayName, setEditOverlayName] = useState('')
  const [editOverlayFont, setEditOverlayFont] = useState('impact')
  const [editOverlayPos, setEditOverlayPos] = useState('h-top-left')

  const NAME_FONTS = [
    { id: 'impact', label: 'Impact Bold', family: 'Impact, Haettenschweiler, sans-serif', weight: 900 },
    { id: 'arialblack', label: 'Arial Black', family: '"Arial Black", "Helvetica Neue", sans-serif', weight: 900 },
    { id: 'georgia', label: 'Georgia Bold', family: 'Georgia, serif', weight: 700 },
    { id: 'system', label: 'System ExtraBold', family: 'system-ui, sans-serif', weight: 800 },
    { id: 'mono', label: 'Mono Bold', family: 'ui-monospace, monospace', weight: 700 },
  ]
  const NAME_POSITIONS = [
    { id: 'h-top-left', label: 'Horizontal · top left' },
    { id: 'h-top-right', label: 'Horizontal · top right' },
    { id: 'v-upper-left', label: 'Vertical · upper left side' },
    { id: 'v-upper-right', label: 'Vertical · upper right side' },
    { id: 'h-bottom-left', label: 'Horizontal · bottom left' },
    { id: 'h-bottom-right', label: 'Horizontal · bottom right' },
  ]

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('character_media')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setItems(data || [])

    // Misc Beauties from published/unlisted shop table (sets grouped)
    const { data: misc, error: mErr } = await supabase
      .from('misc_items')
      .select('*, misc_sets(id, name, code_prefix)')
      .order('created_at', { ascending: false })
    if (mErr) console.error(mErr)
    setMiscItems(misc || [])
    setLoading(false)
  }

  const openItem = (m, kind = 'character') => {
    setSelectedKind(kind)
    setSelected(m)
    setEditTitle(m.title || '')
    setEditUnlock(m.unlock_method || 'shop')
    setEditCost(String(m.token_cost ?? 0))
    setEditEdition(String(m.edition_size ?? 100))
    setEditChar(m.character_name || '')
    setEditOverlayName(m.overlay_name || m.character_name || '')
    setEditOverlayFont(m.overlay_font || 'impact')
    setEditOverlayPos(m.overlay_position || 'h-top-left')
  }

  const togglePublish = async (m, kind = selectedKind) => {
    const next = !m.published
    const table = kind === 'misc' ? 'misc_items' : 'character_media'
    const { error } = await supabase.from(table).update({ published: next }).eq('id', m.id)
    if (error) { alert(error.message); return }
    if (kind === 'misc') {
      setMiscItems(prev => prev.map(x => x.id === m.id ? { ...x, published: next } : x))
    } else {
      setItems(prev => prev.map(x => x.id === m.id ? { ...x, published: next } : x))
    }
    if (selected?.id === m.id) setSelected(s => ({ ...s, published: next }))
  }

  const saveEdit = async () => {
    if (!selected || busy) return
    setBusy(true)
    const overlayName = editOverlayName.trim() || null
    try {
      if (selectedKind === 'misc') {
        const payload = {
          title: editTitle.trim() || null,
          overlay_name: overlayName,
          overlay_font: overlayName ? editOverlayFont : null,
          overlay_position: overlayName ? editOverlayPos : null,
        }
        const { data, error } = await supabase
          .from('misc_items')
          .update(payload)
          .eq('id', selected.id)
          .select('*, misc_sets(id, name, code_prefix)')
          .single()
        if (error) throw new Error(error.message)
        setMiscItems(prev => prev.map(x => x.id === selected.id ? data : x))
        setSelected(data)
      } else {
        const payload = {
          title: editTitle.trim() || null,
          unlock_method: editUnlock,
          token_cost: parseInt(editCost) || 0,
          edition_size: parseInt(editEdition) || 100,
          character_name: editChar.trim() || selected.character_name,
          overlay_name: overlayName,
          overlay_font: overlayName ? editOverlayFont : null,
          overlay_position: overlayName ? editOverlayPos : null,
        }
        const { data, error } = await supabase
          .from('character_media')
          .update(payload)
          .eq('id', selected.id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        setItems(prev => prev.map(x => x.id === selected.id ? data : x))
        setSelected(data)
      }
      alert('Saved')
    } catch (err) {
      alert(err.message)
    }
    setBusy(false)
  }

  const deleteItem = async (m, kind = selectedKind) => {
    const label = kind === 'misc' ? 'misc beauty listing' : 'character media'
    if (!confirm(`Delete this ${label}?`)) return
    const table = kind === 'misc' ? 'misc_items' : 'character_media'
    const { error } = await supabase.from(table).delete().eq('id', m.id)
    if (error) { alert(error.message); return }
    if (kind === 'misc') setMiscItems(prev => prev.filter(x => x.id !== m.id))
    else setItems(prev => prev.filter(x => x.id !== m.id))
    if (selected?.id === m.id) setSelected(null)
  }

  const filterList = (list, kind) => list.filter(m => {
    if (filter === 'image' && m.type !== 'image') return false
    if (filter === 'video' && m.type !== 'video') return false
    if (filter === 'live' && !m.published) return false
    if (filter === 'off' && m.published) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const setName = m.misc_sets?.name || ''
      const hay = kind === 'misc'
        ? `${m.public_id || ''} ${m.title || ''} ${setName} ${m.overlay_name || ''}`.toLowerCase()
        : `${m.character_name || ''} ${m.title || ''} ${m.unlock_method || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const visibleChar = filterList(items, 'character')
  const visibleMisc = filterList(miscItems, 'misc')

  const byChar = {}
  for (const m of visibleChar) {
    const k = m.character_name || 'Unlinked'
    if (!byChar[k]) byChar[k] = []
    byChar[k].push(m)
  }
  const charNames = Object.keys(byChar).sort((a, b) => a.localeCompare(b))

  // Group misc by set (collections together); standalones last
  const bySet = {}
  for (const m of visibleMisc) {
    const set = m.misc_sets
    const k = set?.id ? `set:${set.id}` : 'standalone'
    if (!bySet[k]) {
      bySet[k] = {
        key: k,
        name: set?.name || 'Standalone',
        code: set?.code_prefix || '',
        items: [],
      }
    }
    bySet[k].items.push(m)
  }
  const setGroups = Object.values(bySet).sort((a, b) => {
    if (a.key === 'standalone') return 1
    if (b.key === 'standalone') return -1
    return a.name.localeCompare(b.name)
  })
  // keep sort_index order within sets
  for (const g of setGroups) {
    g.items.sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0) || String(a.public_id || '').localeCompare(String(b.public_id || '')))
  }

  const totalCount = library === 'misc' ? miscItems.length : items.length
  const liveCount = library === 'misc'
    ? miscItems.filter(x => x.published).length
    : items.filter(x => x.published).length

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
            <h1 className="text-xl font-bold">Media</h1>
            <span className="text-xs text-gray-500">{totalCount} total · {liveCount} live</span>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => router.push('/gallery')} className="text-gray-400 hover:text-white">Gallery</button>
            <button onClick={() => router.push('/cards')} className="text-gray-400 hover:text-white">Cards</button>
            <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-white">Settings</button>
          </div>
        </div>

        {/* Library toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setLibrary('character'); setSelected(null) }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border ${
              library === 'character' ? 'bg-pink-700 border-pink-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            Character media
          </button>
          <button
            type="button"
            onClick={() => { setLibrary('misc'); setSelected(null) }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border ${
              library === 'misc' ? 'bg-pink-700 border-pink-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            Misc Beauties
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          {library === 'character'
            ? 'Extra media linked from cards. Live items appear in game media draws.'
            : 'Misc Beauties from Gallery publish. Sets stay grouped. Live = in shop draws.'}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={library === 'misc' ? 'Search set, ID, title...' : 'Search character or title...'}
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
        ) : library === 'character' ? (
          visibleChar.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              <p>No character media yet.</p>
              <p className="mt-2 text-xs">Open a card → Create +media.</p>
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
                        onClick={() => openItem(m, 'character')}
                        className="text-left bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-pink-700 transition"
                      >
                        <div className="relative aspect-[3/4] bg-gray-800">
                          {m.type === 'video' ? (
                            <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                          )}
                          <img src="/ga-mark.png" alt="" className="absolute top-2 right-2 h-12 w-12 object-contain drop-shadow-lg pointer-events-none z-[5]" />
                          <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded z-[6] ${m.published ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
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
          )
        ) : (
          visibleMisc.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              <p>No Misc Beauties yet.</p>
              <p className="mt-2 text-xs">In Gallery, open an image → Add to Misc Beauties.</p>
              <button onClick={() => router.push('/gallery')} className="mt-4 text-pink-400 hover:text-pink-300 text-sm font-semibold">
                Go to Gallery →
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {setGroups.map(g => (
                <div key={g.key}>
                  <h2 className="text-sm font-semibold text-pink-300 mb-2 sticky top-0 bg-black/90 py-1 z-10 flex items-center gap-2 flex-wrap">
                    <span>{g.name}</span>
                    {g.code && <span className="text-[10px] font-mono text-gray-500">{g.code}</span>}
                    <span className="text-gray-600 font-normal">{g.items.length} item{g.items.length === 1 ? '' : 's'}</span>
                    <span className="text-[10px] text-emerald-400 font-normal">
                      {g.items.filter(x => x.published).length} live
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {g.items.map(m => (
                      <button
                        key={m.id}
                        onClick={() => openItem(m, 'misc')}
                        className="text-left bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-pink-700 transition"
                      >
                        <div className="relative aspect-[3/4] bg-gray-800">
                          {m.type === 'video' ? (
                            <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                          )}
                          <img src="/ga-mark.png" alt="" className="absolute top-2 right-2 h-12 w-12 object-contain drop-shadow-lg pointer-events-none z-[5]" />
                          <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded z-[6] ${m.published ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                            {m.published ? 'Live' : 'Off'}
                          </span>
                          <span className="absolute bottom-2 left-2 text-[9px] bg-black/70 px-1.5 py-0.5 rounded font-mono">
                            {m.public_id || m.type}
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold truncate">{m.title || m.public_id || 'Misc'}</p>
                          <p className="text-[10px] text-gray-500">
                            {m.sort_index != null ? `#${m.sort_index}` : m.type}
                            {m.overlay_name ? ` · ${m.overlay_name}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
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
              <h3 className="font-bold">{selectedKind === 'misc' ? 'Misc Beauty' : 'Media detail'}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black mb-4">
              {selected.type === 'video' ? (
                <video src={selected.url} controls className="w-full max-h-[50vh]" playsInline />
              ) : (
                <img src={selected.url} alt="" className="w-full max-h-[50vh] object-contain" />
              )}
              <img src="/ga-mark.png" alt="" className="absolute top-3 right-3 h-16 w-16 object-contain drop-shadow-lg pointer-events-none z-[5]" />
            </div>

            {selectedKind === 'misc' && (
              <div className="mb-3 text-xs text-gray-400 space-y-1">
                <p><span className="text-gray-500">Public ID:</span> <span className="font-mono text-pink-300">{selected.public_id || '—'}</span></p>
                <p><span className="text-gray-500">Set:</span> {selected.misc_sets?.name || 'Standalone'}{selected.misc_sets?.code_prefix ? ` (${selected.misc_sets.code_prefix})` : ''}</p>
                {selected.sort_index != null && <p><span className="text-gray-500">Order in set:</span> {selected.sort_index}</p>}
              </div>
            )}

            {selectedKind === 'character' && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Character name</label>
                <input value={editChar} onChange={e => setEditChar(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />
              </>
            )}

            <label className="block text-xs text-gray-500 mb-1">Name overlay on media (optional)</label>
            <input
              value={editOverlayName}
              onChange={e => setEditOverlayName(e.target.value)}
              placeholder="Shown on the image in-game"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
            />
            {editOverlayName.trim() && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Overlay font</label>
                <select value={editOverlayFont} onChange={e => setEditOverlayFont(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
                  {NAME_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <label className="block text-xs text-gray-500 mb-1">Overlay position</label>
                <select value={editOverlayPos} onChange={e => setEditOverlayPos(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  {NAME_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </>
            )}

            <label className="block text-xs text-gray-500 mb-1">Title</label>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />

            {selectedKind === 'character' && (
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
            )}

            <p className="text-[10px] text-gray-600 mb-3 break-all">URL: {selected.url}</p>
            {selectedKind === 'character' && selected.card_id && (
              <p className="text-[10px] text-gray-600 mb-3">Source card: {selected.card_id}</p>
            )}

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => togglePublish(selected, selectedKind)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold ${selected.published ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {selected.published ? 'Live ✓' : 'Set Live'}
              </button>
              <button onClick={saveEdit} disabled={busy}
                className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg py-3 text-sm font-semibold">
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
            <button onClick={() => deleteItem(selected, selectedKind)}
              className="w-full bg-red-900/80 hover:bg-red-800 rounded-lg py-3 text-sm font-semibold">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
