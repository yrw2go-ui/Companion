// pages/cards.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

const RARITY_STYLES = {
  common:    { ring: 'border-gray-500',   text: 'text-gray-300',   glow: '' },
  uncommon:  { ring: 'border-green-500',  text: 'text-green-400',  glow: 'shadow-[0_0_15px_rgba(34,197,94,0.3)]' },
  rare:      { ring: 'border-blue-500',   text: 'text-blue-400',   glow: 'shadow-[0_0_15px_rgba(59,130,246,0.4)]' },
  epic:      { ring: 'border-purple-500', text: 'text-purple-400', glow: 'shadow-[0_0_20px_rgba(168,85,247,0.5)]' },
  legendary: { ring: 'border-amber-400',  text: 'text-amber-300',  glow: 'shadow-[0_0_25px_rgba(251,191,36,0.6)]' },
}

export default function Cards() {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [concept, setConcept] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState(null)
  const [seedInput, setSeedInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    loadCards()
  }, [])

  const loadCards = async () => {
    const { data } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false })
    setCards(data || [])
    setLoading(false)
  }

  const draftCard = async () => {
    if (!concept.trim() || drafting) return
    setDrafting(true)
    setDraft(null)
    try {
      const res = await fetch('/api/generate-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept }),
      })
      const data = await res.json()
      if (data.card) {
        setDraft(data.card)
      } else {
        alert('Error: ' + (data.error || 'could not draft card'))
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setDrafting(false)
  }

  const updateDraft = (field, value) => {
    setDraft({ ...draft, [field]: value })
  }

  const createCard = async () => {
    if (!draft || generating) return
    setGenerating(true)
    try {
      const imgRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: draft.image_prompt,
          negativePrompt: 'blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text',
          seed: seedInput || undefined,
        }),
      })
      const imgData = await imgRes.json()
      if (!imgData.imageUrl) {
        alert('Image error: ' + (imgData.error || 'failed'))
        setGenerating(false)
        return
      }

      const { error } = await supabase.from('cards').insert([{
        name: draft.name,
        title: draft.title,
        description: draft.description,
        flavor_text: draft.flavor_text,
        rarity: (draft.rarity || 'common').toLowerCase(),
        image_url: imgData.imageUrl,
        image_prompt: draft.image_prompt,
        seed: imgData.seed,
        hp: parseInt(draft.hp) || 50,
        attack: parseInt(draft.attack) || 50,
        defense: parseInt(draft.defense) || 50,
        speed: parseInt(draft.speed) || 50,
      }])

      if (error) {
        alert('Save error: ' + error.message)
        setGenerating(false)
        return
      }

      setShowCreate(false)
      setDraft(null)
      setConcept('')
      setSeedInput('')
      loadCards()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setGenerating(false)
  }

  const deleteCard = async (card) => {
    if (!confirm('Delete this card?')) return
    await supabase.from('cards').delete().eq('id', card.id)
    if (card.image_url) {
      const fileName = card.image_url.split('/character-images/')[1]
      if (fileName) {
        await supabase.storage.from('character-images').remove([fileName])
      }
    }
    setSelected(null)
    loadCards()
  }

  const copySeed = (seed) => {
    navigator.clipboard?.writeText(String(seed))
  }

  const statBar = (label, value) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-7 text-right text-gray-300">{value}</span>
    </div>
  )

  const renderCard = (card, big = false) => {
    const style = RARITY_STYLES[card.rarity] || RARITY_STYLES.common
    return (
      <div className={`bg-gray-950 border-2 ${style.ring} ${style.glow} rounded-2xl overflow-hidden`}>
        {card.image_url && (
          <img src={card.image_url} alt={card.name} className="w-full aspect-[3/4] object-cover" />
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold leading-tight">{card.name}</div>
              {card.title && <div className="text-xs text-gray-500">{card.title}</div>}
            </div>
            <span className={`text-[10px] uppercase font-bold ${style.text}`}>{card.rarity}</span>
          </div>

          {big && (
            <>
              {card.description && (
                <p className="text-xs text-gray-400 mt-2">{card.description}</p>
              )}
              {card.flavor_text && (
                <p className="text-xs italic text-gray-500 mt-2">"{card.flavor_text}"</p>
              )}
              <div className="space-y-1 mt-3">
                {statBar('HP', card.hp)}
                {statBar('ATK', card.attack)}
                {statBar('DEF', card.defense)}
                {statBar('SPD', card.speed)}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Cards</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold"
        >
          + New
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : cards.length === 0 ? (
        <p className="text-gray-500 text-sm">No cards yet. Tap "+ New" to summon one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => (
            <button key={c.id} onClick={() => setSelected(c)} className="text-left">
              {renderCard(c, false)}
            </button>
          ))}
        </div>
      )}

      {/* Create flow */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">New Card</h2>

            {!draft ? (
              <>
                <label className="block text-xs text-gray-400 mb-1">Concept</label>
                <textarea
                  value={concept}
                  onChange={e => setConcept(e.target.value)}
                  rows={3}
                  placeholder="e.g. a storm-wielding desert nomad who speaks to sandworms"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm mb-4"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setShowCreate(false); setConcept('') }} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">
                    Cancel
                  </button>
                  <button onClick={draftCard} disabled={drafting} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {drafting ? 'Drafting...' : 'Draft Card'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">Edit anything before generating the art.</p>

                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input value={draft.name || ''} onChange={e => updateDraft('name', e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Title</label>
                <input value={draft.title || ''} onChange={e => updateDraft('title', e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Rarity</label>
                <select value={draft.rarity || 'common'} onChange={e => updateDraft('rarity', e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>

                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea value={draft.description || ''} onChange={e => updateDraft('description', e.target.value)} rows={2}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Flavor Text</label>
                <input value={draft.flavor_text || ''} onChange={e => updateDraft('flavor_text', e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {['hp', 'attack', 'defense', 'speed'].map(stat => (
                    <div key={stat}>
                      <label className="block text-xs text-gray-400 mb-1 uppercase">{stat.slice(0, 3)}</label>
                      <input type="number" value={draft[stat] || 50} onChange={e => updateDraft(stat, e.target.value)}
                        className="w-full bg-black border border-gray-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-purple-500" />
                    </div>
                  ))}
                </div>

                <label className="block text-xs text-gray-400 mb-1">Art Prompt</label>
                <textarea value={draft.image_prompt || ''} onChange={e => updateDraft('image_prompt', e.target.value)} rows={4}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Seed (optional — paste one to reuse a look)</label>
                <input value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="leave blank for random"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500" />

                <div className="flex gap-2">
                  <button onClick={() => setDraft(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">
                    Back
                  </button>
                  <button onClick={createCard} disabled={generating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {generating ? 'Summoning...' : 'Create Card'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Card detail */}
      {selected && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-xs my-8" onClick={e => e.stopPropagation()}>
            {renderCard(selected, true)}

            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>Seed: {selected.seed ?? 'unknown'}</span>
              {selected.seed && (
                <button onClick={() => copySeed(selected.seed)} className="text-gray-400 hover:text-white">
                  Copy
                </button>
              )}
            </div>

            <button onClick={() => deleteCard(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-3">
              Delete Card
            </button>
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
