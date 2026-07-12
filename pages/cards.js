// pages/cards.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

const SIZES = [
  { value: '768*1024', label: 'Portrait 3:4 (classic card)' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
]

const ART_STYLES = [
  { value: '', label: 'None (use prompt as-is)' },
  { value: 'photorealistic, DSLR photo, natural skin texture, soft cinematic lighting, shallow depth of field', label: 'Photorealistic' },
  { value: 'digital painting, painterly brushwork, rich color, dramatic lighting, fantasy art, artstation quality', label: 'Digital Painting' },
  { value: 'anime style, cel shaded, clean linework, vibrant colors, detailed eyes', label: 'Anime' },
  { value: 'oil painting, classical portraiture, renaissance lighting, canvas texture, old master style', label: 'Oil Painting' },
  { value: 'watercolor illustration, soft washes, delicate linework, pastel palette, dreamy', label: 'Watercolor' },
  { value: 'comic book art, bold ink outlines, halftone shading, dynamic composition, graphic novel style', label: 'Comic Book' },
  { value: 'art nouveau, ornate decorative border motifs, flowing organic lines, gold accents, Alphonse Mucha style', label: 'Art Nouveau' },
  { value: 'dark fantasy, gothic atmosphere, moody chiaroscuro lighting, muted palette, intricate detail', label: 'Dark Fantasy' },
  { value: 'cyberpunk, neon lighting, chrome and holograms, rain-slick city night, high contrast', label: 'Cyberpunk' },
  { value: 'ethereal fantasy, glowing rim light, soft bloom, luminous atmosphere, celestial mood', label: 'Ethereal' },
]

const RARITY_STYLES = {
  common:    { ring: 'border-gray-500',   text: 'text-gray-300',   glow: '',                                        code: 'COM' },
  uncommon:  { ring: 'border-green-500',  text: 'text-green-400',  glow: 'shadow-[0_0_15px_rgba(34,197,94,0.3)]',   code: 'UNC' },
  rare:      { ring: 'border-blue-500',   text: 'text-blue-400',   glow: 'shadow-[0_0_15px_rgba(59,130,246,0.4)]',  code: 'RAR' },
  epic:      { ring: 'border-purple-500', text: 'text-purple-400', glow: 'shadow-[0_0_20px_rgba(168,85,247,0.5)]',  code: 'EPI' },
  legendary: { ring: 'border-amber-400',  text: 'text-amber-300',  glow: 'shadow-[0_0_25px_rgba(251,191,36,0.6)]',  code: 'LEG' },
}

export default function Cards() {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [concept, setConcept] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState(null)
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [size, setSize] = useState('768*1024')
  const [artStyle, setArtStyle] = useState(ART_STYLES[1].value)
  const [seedInput, setSeedInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
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

  const makeCardNumber = async (rarity) => {
    const code = (RARITY_STYLES[rarity] || RARITY_STYLES.common).code
    const { count } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('rarity', rarity)
    const next = (count || 0) + 1
    return `${code}-${String(next).padStart(3, '0')}`
  }

  const withStyle = (basePrompt) => {
    if (!artStyle) return basePrompt
    return `${basePrompt}, ${artStyle}`
  }

  const genImage = async (imgPrompt, seedVal) => {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: withStyle(imgPrompt),
        negativePrompt: negative,
        seed: seedVal || undefined,
        size,
      }),
    })
    return res.json()
  }

  const createCard = async () => {
    if (!draft || generating) return
    setGenerating(true)

    try {
      setProgress('Generating front art...')
      const front = await genImage(draft.image_prompt, seedInput)
      if (!front.imageUrl) {
        alert('Front image error: ' + (front.error || 'failed'))
        setGenerating(false)
        setProgress('')
        return
      }

      setProgress('Generating back art...')
      const back = await genImage(draft.back_image_prompt, '')
      if (!back.imageUrl) {
        alert('Back image error: ' + (back.error || 'failed'))
        setGenerating(false)
        setProgress('')
        return
      }

      setProgress('Saving...')
      const rarity = (draft.rarity || 'common').toLowerCase()
      const cardNumber = await makeCardNumber(rarity)

      const { error } = await supabase.from('cards').insert([{
        name: draft.name,
        title: draft.title,
        description: draft.description,
        flavor_text: draft.flavor_text,
        rarity,
        card_number: cardNumber,
        image_url: front.imageUrl,
        image_prompt: withStyle(draft.image_prompt),
        seed: front.seed,
        back_image_url: back.imageUrl,
        back_image_prompt: withStyle(draft.back_image_prompt),
        back_seed: back.seed,
        negative_prompt: negative,
        hp: parseInt(draft.hp) || 50,
        attack: parseInt(draft.attack) || 50,
        defense: parseInt(draft.defense) || 50,
        speed: parseInt(draft.speed) || 50,
      }])

      if (error) {
        alert('Save error: ' + error.message)
        setGenerating(false)
        setProgress('')
        return
      }

      setShowCreate(false)
      setDraft(null)
      setConcept('')
      setSeedInput('')
      setNegative(DEFAULT_NEGATIVE)
      loadCards()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setGenerating(false)
    setProgress('')
  }

  const deleteCard = async (card) => {
    if (!confirm('Delete this card?')) return
    await supabase.from('cards').delete().eq('id', card.id)
    const files = []
    if (card.image_url) {
      const f = card.image_url.split('/character-images/')[1]
      if (f) files.push(f)
    }
    if (card.back_image_url) {
      const f = card.back_image_url.split('/character-images/')[1]
      if (f) files.push(f)
    }
    if (files.length) {
      await supabase.storage.from('character-images').remove(files)
    }
    setSelected(null)
    loadCards()
  }

  const copy = (val) => navigator.clipboard?.writeText(String(val))

  const statBar = (label, value) => (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-8 text-gray-300">{label}</span>
      <div className="flex-1 bg-white/20 rounded-full h-1.5">
        <div className="bg-white h-1.5 rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-6 text-right text-gray-200">{value}</span>
    </div>
  )

  const cardFront = (card, style) => (
    <div className={`bg-gray-950 border-2 ${style.ring} ${style.glow} rounded-2xl overflow-hidden`}>
      {card.image_url && (
        <img src={card.image_url} alt={card.name} className="w-full aspect-[3/4] object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">{card.name}</div>
            {card.title && <div className="text-xs text-gray-500 truncate">{card.title}</div>}
          </div>
          <span className={`text-[10px] uppercase font-bold shrink-0 ${style.text}`}>{card.rarity}</span>
        </div>
      </div>
    </div>
  )

  const cardBack = (card, style) => (
    <div className={`relative bg-gray-950 border-2 ${style.ring} ${style.glow} rounded-2xl overflow-hidden`}>
      {card.back_image_url ? (
        <img src={card.back_image_url} alt="" className="w-full aspect-[3/4] object-cover" />
      ) : (
        <div className="w-full aspect-[3/4] bg-gray-900 flex items-center justify-center text-gray-700 text-xs">
          no back art
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/20" />

      <div className="absolute inset-0 p-3 flex flex-col justify-end">
        {card.description && (
          <p className="text-[11px] text-gray-300 leading-snug mb-2">{card.description}</p>
        )}
        {card.flavor_text && (
          <p className="text-[10px] italic text-gray-400 mb-2">"{card.flavor_text}"</p>
        )}
        <div className="space-y-1">
          {statBar('HP', card.hp)}
          {statBar('ATK', card.attack)}
          {statBar('DEF', card.defense)}
          {statBar('SPD', card.speed)}
        </div>
      </div>

      <div className="p-3 pt-2 flex items-center justify-between border-t border-white/10">
        <span className="text-[10px] font-mono text-gray-500">{card.card_number || '—'}</span>
        <span className={`text-[10px] uppercase font-bold ${style.text}`}>{card.rarity}</span>
      </div>
    </div>
  )

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
          {cards.map(c => {
            const style = RARITY_STYLES[c.rarity] || RARITY_STYLES.common
            return (
              <button key={c.id} onClick={() => setSelected(c)} className="text-left">
                {cardFront(c, style)}
              </button>
            )
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">New Card</h2>

            {!draft ? (
              <>
                <label className="block text-xs text-gray-400 mb-1">Concept</label>
                <textarea
                  value={concept}
                  onChange={e => setConcept(e.target.value)}
                  rows={3}
                  placeholder="e.g. an elegant sorceress in flowing silk, garden of moonflowers"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500"
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
                <p className="text-xs text-gray-500 mb-3">Edit anything before generating. Two images will be made (front and back).</p>

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

                <label className="block text-xs text-gray-400 mb-1">Art Style</label>
                <select value={artStyle} onChange={e => setArtStyle(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
                  {ART_STYLES.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mb-3">Appended to both art prompts for a consistent look.</p>

                <label className="block text-xs text-gray-400 mb-1">Front Art Prompt</label>
                <textarea value={draft.image_prompt || ''} onChange={e => updateDraft('image_prompt', e.target.value)} rows={4}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Back Art Prompt</label>
                <textarea value={draft.back_image_prompt || ''} onChange={e => updateDraft('back_image_prompt', e.target.value)} rows={4}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
                <textarea value={negative} onChange={e => setNegative(e.target.value)} rows={3}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
                <select value={size} onChange={e => setSize(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <label className="block text-xs text-gray-400 mb-1">Front Seed (optional)</label>
                <input value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="leave blank for random"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500" />

                {progress && <p className="text-xs text-purple-400 mb-3">{progress}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setDraft(null)} disabled={generating} className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold">
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

      {selected && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg my-6" onClick={e => e.stopPropagation()}>
            {(() => {
              const style = RARITY_STYLES[selected.rarity] || RARITY_STYLES.common
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase text-gray-500 mb-1 text-center">Front</p>
                      {cardFront(selected, style)}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-500 mb-1 text-center">Back</p>
                      {cardBack(selected, style)}
                    </div>
                  </div>

                  <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Card No.</span>
                      <span className="font-mono text-gray-300">{selected.card_number || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Front seed</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-300">{selected.seed ?? '—'}</span>
                        {selected.seed && (
                          <button onClick={() => copy(selected.seed)} className="text-gray-500 hover:text-white">Copy</button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Back seed</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-300">{selected.back_seed ?? '—'}</span>
                        {selected.back_seed && (
                          <button onClick={() => copy(selected.back_seed)} className="text-gray-500 hover:text-white">Copy</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <button onClick={() => deleteCard(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-3">
                    Delete Card
                  </button>
                  <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
                    Close
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
