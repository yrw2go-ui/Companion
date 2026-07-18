// pages/gallery.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_NEGATIVE = 'blurry, wide hips, mature woman, big breasts, curvy female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'
const SIZES = [
  { value: '768*1024', label: 'Portrait 3:4' },
  { value: '1024*768', label: 'Landscape 4:3' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
  { value: '1024*576', label: 'Wide 16:9' },
]

export default function Gallery() {
  const router = useRouter()
  const [media, setMedia] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [gSort, setGSort] = useState('date_desc')
  const [gSearch, setGSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const [showCreate, setShowCreate] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [seed, setSeed] = useState('')
  const [size, setSize] = useState('768*1024')
  const [charId, setCharId] = useState('')
  const [guidance, setGuidance] = useState(3.5)
  const [steps, setSteps] = useState(28)
  const [creating, setCreating] = useState(false)

  const [showVideo, setShowVideo] = useState(false)
  const [videoSource, setVideoSource] = useState('')
  const [videoPrompt, setVideoPrompt] = useState('smooth natural motion, sensual movement')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoRes, setVideoRes] = useState('720p')
  const [animating, setAnimating] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: msgMedia } = await supabase
      .from('messages')
      .select('*')
      .in('role', ['image', 'video'])
      .order('created_at', { ascending: false })

    const { data: galMedia } = await supabase
      .from('gallery_media')
      .select('*')
      .order('created_at', { ascending: false })

    const fromChats = (msgMedia || [])
      .filter(m => m.content && m.content !== 'generating')
      .map(m => ({
        key: 'msg_' + m.id,
        id: m.id,
        source: 'messages',
        type: m.role,
        url: m.content,
        seed: m.seed ?? null,
        prompt: m.prompt ?? null,
        negative_prompt: m.negative_prompt ?? null,
        size: m.size ?? null,
        created_at: m.created_at,
      }))

    const fromGallery = (galMedia || []).map(g => ({
      key: 'gal_' + g.id,
      id: g.id,
      source: 'gallery_media',
      type: g.type,
      url: g.url,
      seed: g.seed ?? null,
      prompt: g.prompt ?? null,
      negative_prompt: g.negative_prompt ?? null,
      size: g.size ?? null,
      created_at: g.created_at,
    }))

    setMedia([...fromChats, ...fromGallery].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

    const { data: chars } = await supabase.from('characters').select('id, name')
    setCharacters(chars || [])
    setLoading(false)
  }

  const openCreate = () => {
    setPrompt('')
    setNegative(DEFAULT_NEGATIVE)
    setSeed('')
    setSize('768*1024')
    setCharId('')
    setGuidance(3.5)
    setSteps(28)
    setShowCreate(true)
  }

  // reopen create modal pre-filled from an existing image
  const openRegenerate = (item, keepSeed) => {
    setPrompt(item.prompt || '')
    setNegative(item.negative_prompt || DEFAULT_NEGATIVE)
    setSeed(keepSeed && item.seed ? String(item.seed) : '')
    setSize(item.size || '768*1024')
    setCharId('')
    setGuidance(3.5)
    setSteps(28)
    setSelected(null)
    setShowCreate(true)
  }

  const createImage = async () => {
    if (!prompt.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negativePrompt: negative,
          seed: seed || undefined,
          size,
          guidance,
          steps,
        }),
      })
      const data = await res.json()
      if (!data.imageUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setCreating(false)
        return
      }

      await supabase.from('gallery_media').insert([{
        type: 'image',
        url: data.imageUrl,
        prompt,
        negative_prompt: negative,
        seed: data.seed,
        size: data.size,
        character_id: charId || null,
      }])

      setShowCreate(false)
      setPrompt('')
      setSeed('')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setCreating(false)
  }

  const openAnimate = (url) => {
    setVideoSource(url)
    setVideoPrompt('smooth natural motion, sensual movement')
    setVideoDuration(5)
    setVideoRes('720p')
    setShowVideo(true)
    setSelected(null)
  }

  const animate = async () => {
    if (animating) return
    setAnimating(true)
    setShowVideo(false)
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: videoSource, prompt: videoPrompt, duration: videoDuration, resolution: videoRes }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Video error: ' + (data.error || 'failed'))
        setAnimating(false)
        return
      }
      await supabase.from('gallery_media').insert([{
        type: 'video',
        url: data.videoUrl,
        prompt: videoPrompt,
      }])
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setAnimating(false)
  }

  const remove = async (item) => {
    if (!confirm('Delete this permanently?')) return
    await supabase.from(item.source).delete().eq('id', item.id)
    const fileName = item.url.split('/character-images/')[1]
    if (fileName) await supabase.storage.from('character-images').remove([fileName])
    setSelected(null)
    load()
  }

  const copy = (val) => navigator.clipboard?.writeText(String(val))

  const shown = (() => {
    let list = media.filter(m => {
      if (filter === 'images') return m.type === 'image'
      if (filter === 'videos') return m.type === 'video'
      return true
    })

    const q = gSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(m => {
        const hay = [m.prompt, m.negative_prompt, m.type].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
    }

    const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at)
    if (gSort === 'date_asc') list.sort(byDate)
    else list.sort((a, b) => byDate(b, a))

    return list
  })()

  const tab = (key, label) => (
    <button onClick={() => setFilter(key)}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold ${filter === key ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Gallery</h1>
        <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">
          + Create
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        {tab('all', 'All')}
        {tab('images', 'Images')}
        {tab('videos', 'Videos')}
      </div>

      <input
        value={gSearch}
        onChange={e => setGSearch(e.target.value)}
        placeholder="Search by prompt..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500"
      />

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[['date_desc', 'Newest'], ['date_asc', 'Oldest']].map(([val, label]) => (
          <button key={val} onClick={() => setGSort(val)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${gSort === val ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {animating && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          Animating... (1-2 min)
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-gray-500 text-sm">Nothing here yet. Tap "+ Create" to make something.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map(item => (
            <button key={item.key} onClick={() => setSelected(item)}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-900">
              {item.type === 'image' ? (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video src={item.url} className="w-full h-full object-cover" muted />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded-full px-2 py-0.5 text-[10px]">▶ video</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* CREATE / REGENERATE */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">Create Image</h2>

            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
              placeholder="describe the image..."
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
            <textarea value={negative} onChange={e => setNegative(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
            <select value={size} onChange={e => setSize(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
            <input value={seed} onChange={e => setSeed(e.target.value)} placeholder="leave blank for random"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Guidance: {guidance}</label>
            <input type="range" min="1" max="10" step="0.5" value={guidance}
              onChange={e => setGuidance(parseFloat(e.target.value))}
              className="w-full mb-1 accent-purple-500" />
            <p className="text-[10px] text-gray-600 mb-3">Low (2-4) = softer, more natural. High (6+) = rigid, can look over-cooked. Flux likes 3-4.</p>

            <label className="block text-xs text-gray-400 mb-1">Steps: {steps}</label>
            <input type="range" min="10" max="50" step="1" value={steps}
              onChange={e => setSteps(parseInt(e.target.value))}
              className="w-full mb-1 accent-purple-500" />
            <p className="text-[10px] text-gray-600 mb-3">More steps = more detail, slower. 28 is a good default.</p>

            <label className="block text-xs text-gray-400 mb-1">Tag to Character (optional)</label>
            <select value={charId} onChange={e => setCharId(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="">None</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={createImage} disabled={creating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {creating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANIMATE */}
      {showVideo && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Animate Image</h2>
            <p className="text-xs text-gray-500 mb-3">Takes 1-2 min and costs more than an image.</p>
            <img src={videoSource} alt="" className="w-28 rounded-lg mb-3" />
            <label className="block text-xs text-gray-400 mb-1">Motion Prompt</label>
            <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={videoDuration} onChange={e => setVideoDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds (2x cost)</option>
              <option value={15}>15 seconds (3x cost)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={videoRes} onChange={e => setVideoRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="720p">720p</option>
              <option value="1080p">1080p (costs more)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowVideo(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={animate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Animate</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {selected && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-5 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
            {selected.type === 'image' ? (
              <img src={selected.url} alt="" className="w-full rounded-2xl" />
            ) : (
              <video src={selected.url} controls autoPlay loop className="w-full rounded-2xl" />
            )}

            <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Seed</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{selected.seed ?? '—'}</span>
                  {selected.seed && <button onClick={() => copy(selected.seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-400">{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              {selected.prompt && (
                <div className="pt-1 border-t border-gray-800">
                  <p className="text-gray-500 mb-1">Prompt</p>
                  <p className="text-gray-400 leading-snug">{selected.prompt}</p>
                </div>
              )}
            </div>

            {selected.type === 'image' && selected.prompt && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => openRegenerate(selected, true)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">
                  Rerun same seed
                </button>
                <button onClick={() => openRegenerate(selected, false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">
                  Rerun new seed
                </button>
              </div>
            )}

            {selected.type === 'image' && (
              <button onClick={() => openAnimate(selected.url)}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
                🎬 Animate
              </button>
            )}

            <button onClick={() => remove(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">Delete</button>
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
