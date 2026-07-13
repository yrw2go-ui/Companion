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
  { value: 'art nouveau, ornate decorative motifs, flowing organic lines, gold accents, Alphonse Mucha style', label: 'Art Nouveau' },
  { value: 'dark fantasy, gothic atmosphere, moody chiaroscuro lighting, muted palette, intricate detail', label: 'Dark Fantasy' },
  { value: 'cyberpunk, neon lighting, chrome and holograms, rain-slick city night, high contrast', label: 'Cyberpunk' },
  { value: 'ethereal fantasy, glowing rim light, soft bloom, luminous atmosphere, celestial mood', label: 'Ethereal' },
]

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']

// visual treatment per rarity
const TREAT = {
  common:    { edge: 'edge-common',    glow: '',                badge: 'badge-common',    foil: '',            holo: false, code: 'COM' },
  uncommon:  { edge: 'edge-uncommon',  glow: 'glow-uncommon',   badge: 'badge-uncommon',  foil: '',            holo: false, code: 'UNC' },
  rare:      { edge: 'edge-rare',      glow: 'glow-rare',       badge: 'badge-rare',      foil: 'foil',        holo: false, code: 'RAR' },
  epic:      { edge: 'edge-epic',      glow: 'glow-epic',       badge: 'badge-epic',      foil: 'foil',        holo: true,  code: 'EPI' },
  legendary: { edge: 'edge-legendary', glow: 'glow-legendary',  badge: 'badge-legendary', foil: 'foil-strong', holo: true,  code: 'LEG' },
}

const treatOf = (r) => TREAT[r] || TREAT.common

const emptyDraft = () => ({
  name: '',
  title: '',
  description: '',
  flavor_text: '',
  rarity: 'common',
  stats: [{ label: 'Power', value: 50 }],
  image_prompt: '',
  back_image_prompt: '',
})

export default function Cards() {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

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

  const [editing, setEditing] = useState(null)
  const [editNegative, setEditNegative] = useState(DEFAULT_NEGATIVE)
  const [editSize, setEditSize] = useState('768*1024')
  const [editStyle, setEditStyle] = useState('')
  const [saving, setSaving] = useState(false)
  const [regenProgress, setRegenProgress] = useState('')

  useEffect(() => { loadCards() }, [])

  const loadCards = async () => {
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false })
    setCards(data || [])
    setLoading(false)
  }

  const normalizeStats = (card) => {
    if (Array.isArray(card.stats) && card.stats.length) return card.stats
    const legacy = []
    if (card.hp != null) legacy.push({ label: 'HP', value: card.hp })
    if (card.attack != null) legacy.push({ label: 'ATK', value: card.attack })
    if (card.defense != null) legacy.push({ label: 'DEF', value: card.defense })
    if (card.speed != null) legacy.push({ label: 'SPD', value: card.speed })
    return legacy
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
      if (data.card) setDraft(data.card)
      else alert('Error: ' + (data.error || 'could not draft card'))
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setDrafting(false)
  }

  const withStyle = (base, style) => (!style ? base : `${base}, ${style}`)

  const genImage = async (imgPrompt, seedVal, neg, sz, style) => {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: withStyle(imgPrompt, style),
        negativePrompt: neg,
        seed: seedVal || undefined,
        size: sz,
      }),
    })
    return res.json()
  }

  const makeCardNumber = async (rarity) => {
    const code = treatOf(rarity).code
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('rarity', rarity)
    return `${code}-${String((count || 0) + 1).padStart(3, '0')}`
  }

  const createCard = async () => {
    if (!draft || generating) return
    if (!draft.image_prompt?.trim()) { alert('Front art prompt is required'); return }
    setGenerating(true)
    try {
      setProgress('Generating front art...')
      const front = await genImage(draft.image_prompt, seedInput, negative, size, artStyle)
      if (!front.imageUrl) { alert('Front image error: ' + (front.error || 'failed')); setGenerating(false); setProgress(''); return }

      let back = { imageUrl: null, seed: null }
      if (draft.back_image_prompt?.trim()) {
        setProgress('Generating back art...')
        back = await genImage(draft.back_image_prompt, '', negative, size, artStyle)
        if (!back.imageUrl) { alert('Back image error: ' + (back.error || 'failed')); setGenerating(false); setProgress(''); return }
      }

      setProgress('Saving...')
      const rarity = (draft.rarity || 'common').toLowerCase()
      const cardNumber = await makeCardNumber(rarity)

      const { error } = await supabase.from('cards').insert([{
        name: draft.name || 'Unnamed',
        title: draft.title,
        description: draft.description,
        flavor_text: draft.flavor_text,
        rarity,
        card_number: cardNumber,
        stats: draft.stats || [],
        image_url: front.imageUrl,
        image_prompt: withStyle(draft.image_prompt, artStyle),
        seed: front.seed,
        back_image_url: back.imageUrl,
        back_image_prompt: draft.back_image_prompt ? withStyle(draft.back_image_prompt, artStyle) : null,
        back_seed: back.seed,
        negative_prompt: negative,
      }])

      if (error) { alert('Save error: ' + error.message); setGenerating(false); setProgress(''); return }

      setShowCreate(false); setDraft(null); setConcept(''); setSeedInput(''); setNegative(DEFAULT_NEGATIVE)
      loadCards()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setGenerating(false); setProgress('')
  }

  const openEdit = (card) => {
    setEditing({ ...card, stats: normalizeStats(card) })
    setEditNegative(card.negative_prompt || DEFAULT_NEGATIVE)
    setEditSize('768*1024')
    setEditStyle('')
    setSelected(null)
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    setSaving(true)
    const { error } = await supabase.from('cards').update({
      name: editing.name,
      title: editing.title,
      description: editing.description,
      flavor_text: editing.flavor_text,
      rarity: (editing.rarity || 'common').toLowerCase(),
      card_number: editing.card_number,
      stats: editing.stats,
      image_prompt: editing.image_prompt,
      back_image_prompt: editing.back_image_prompt,
      negative_prompt: editNegative,
    }).eq('id', editing.id)
    setSaving(false)
    if (error) { alert('Save error: ' + error.message); return }
    setEditing(null)
    loadCards()
  }

  const regenSide = async (side) => {
    if (!editing || regenProgress) return
    const promptText = side === 'front' ? editing.image_prompt : editing.back_image_prompt
    if (!promptText?.trim()) { alert('Add an art prompt first'); return }

    setRegenProgress(`Regenerating ${side}...`)
    const result = await genImage(promptText, '', editNegative, editSize, editStyle)
    if (!result.imageUrl) { alert('Error: ' + (result.error || 'failed')); setRegenProgress(''); return }

    const oldUrl = side === 'front' ? editing.image_url : editing.back_image_url
    const patch = side === 'front'
      ? { image_url: result.imageUrl, seed: result.seed }
      : { back_image_url: result.imageUrl, back_seed: result.seed }

    const { error } = await supabase.from('cards').update(patch).eq('id', editing.id)
    if (error) { alert('Save error: ' + error.message); setRegenProgress(''); return }

    if (oldUrl) {
      const f = oldUrl.split('/character-images/')[1]
      if (f) await supabase.storage.from('character-images').remove([f])
    }

    setEditing({ ...editing, ...patch })
    setRegenProgress('')
    loadCards()
  }

  const deleteCard = async (card) => {
    if (!confirm('Delete this card?')) return
    await supabase.from('cards').delete().eq('id', card.id)
    const files = []
    for (const u of [card.image_url, card.back_image_url]) {
      if (u) {
        const f = u.split('/character-images/')[1]
        if (f) files.push(f)
      }
    }
    if (files.length) await supabase.storage.from('character-images').remove(files)
    setSelected(null); setEditing(null)
    loadCards()
  }

  const copy = (val) => navigator.clipboard?.writeText(String(val))

  const statEditor = (statsArr, onChange) => (
    <div className="space-y-2 mb-3">
      {statsArr.map((s, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={s.label} placeholder="Label"
            onChange={e => { const c = [...statsArr]; c[i] = { ...c[i], label: e.target.value }; onChange(c) }}
            className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
          <input type="number" value={s.value}
            onChange={e => { const c = [...statsArr]; c[i] = { ...c[i], value: parseInt(e.target.value) || 0 }; onChange(c) }}
            className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-purple-500" />
          <button onClick={() => onChange(statsArr.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-400 px-2 text-sm">✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...statsArr, { label: '', value: 50 }])}
        className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">
        + Add Stat
      </button>
    </div>
  )

  const statBar = (label, value, i, dense) => (
    <div key={i} className={`flex items-center gap-2 ${dense ? 'text-[9px]' : 'text-[11px]'}`}>
      <span className={`${dense ? 'w-10' : 'w-14'} text-gray-200 truncate uppercase tracking-wide`}>{label}</span>
      <div className="flex-1 bg-white/25 rounded-full h-1">
        <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-5 text-right text-gray-100">{value}</span>
    </div>
  )

  // FRONT — full-bleed art, glass nameplate, badge, foil
  const cardFront = (card) => {
    const t = treatOf(card.rarity)
    return (
      <div className={`card-shell ${t.edge} ${t.glow}`}>
        <div className={`card-inner ${t.foil} ${t.holo ? 'holo' : ''}`}>
          <div className="relative aspect-[3/4]">
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gray-900" />
            )}

            <span className={`badge ${t.badge}`}>{card.rarity}</span>

            <div className="nameplate">
              <div className="font-bold text-[15px] leading-tight truncate tracking-wide">{card.name}</div>
              {card.title && (
                <div className="text-[10px] text-gray-300 truncate uppercase tracking-[0.12em] mt-0.5">{card.title}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // BACK — second art, stats + lore overlaid, card number
  const cardBack = (card) => {
    const t = treatOf(card.rarity)
    const stats = normalizeStats(card)
    return (
      <div className={`card-shell ${t.edge} ${t.glow}`}>
        <div className={`card-inner ${t.foil} ${t.holo ? 'holo' : ''}`}>
          <div className="relative aspect-[3/4]">
            {card.back_image_url ? (
              <img src={card.back_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-gray-700 text-[10px]">
                no back art
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/25" />

            <span className={`badge ${t.badge}`}>{card.rarity}</span>

            <div className="absolute inset-0 z-[4] p-3 flex flex-col justify-end">
              {card.description && (
                <p className="text-[10px] text-gray-200 leading-snug mb-2">{card.description}</p>
              )}
              {card.flavor_text && (
                <p className="text-[9px] italic text-gray-400 mb-2 leading-snug">"{card.flavor_text}"</p>
              )}
              <div className="space-y-1 mb-2">
                {stats.map((s, i) => statBar(s.label, s.value, i, true))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/15">
                <span className="text-[9px] font-mono text-gray-400 tracking-widest">{card.card_number || '—'}</span>
                <span className="text-[9px] text-gray-500 tracking-widest uppercase">Companion</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const inputRow = (label, value, onChange, multiline = false, rows = 2) => (
    <>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows}
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold tracking-wide">Cards</h1>
        <button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">
          + New
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : cards.length === 0 ? (
        <p className="text-gray-500 text-sm">No cards yet. Tap "+ New" to summon one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map(c => (
            <button key={c.id} onClick={() => setSelected(c)} className="text-left">
              {cardFront(c)}
            </button>
          ))}
        </div>
      )}

      {/* CREATE */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">New Card</h2>

            {!draft ? (
              <>
                <label className="block text-xs text-gray-400 mb-1">Concept</label>
                <textarea value={concept} onChange={e => setConcept(e.target.value)} rows={3}
                  placeholder="e.g. an elegant sorceress in flowing silk, garden of moonflowers"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
                <button onClick={() => setDraft(emptyDraft())} className="text-xs text-gray-500 hover:text-gray-300 mb-4">
                  or build it manually →
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setShowCreate(false); setConcept('') }} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
                  <button onClick={draftCard} disabled={drafting} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {drafting ? 'Drafting...' : 'Draft Card'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">Edit anything before generating.</p>

                {inputRow('Name', draft.name, v => setDraft({ ...draft, name: v }))}
                {inputRow('Title', draft.title, v => setDraft({ ...draft, title: v }))}

                <label className="block text-xs text-gray-400 mb-1">Rarity</label>
                <select value={draft.rarity || 'common'} onChange={e => setDraft({ ...draft, rarity: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {RARITIES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>

                {inputRow('Description', draft.description, v => setDraft({ ...draft, description: v }), true, 2)}
                {inputRow('Flavor Text', draft.flavor_text, v => setDraft({ ...draft, flavor_text: v }))}

                <label className="block text-xs text-gray-400 mb-1">Stats</label>
                <p className="text-[10px] text-gray-600 mb-2">Rename, add, or remove any stat.</p>
                {statEditor(draft.stats || [], arr => setDraft({ ...draft, stats: arr }))}

                <label className="block text-xs text-gray-400 mb-1">Art Style</label>
                <select value={artStyle} onChange={e => setArtStyle(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {ART_STYLES.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
                </select>

                {inputRow('Front Art Prompt', draft.image_prompt, v => setDraft({ ...draft, image_prompt: v }), true, 4)}
                {inputRow('Back Art Prompt (optional)', draft.back_image_prompt, v => setDraft({ ...draft, back_image_prompt: v }), true, 4)}
                {inputRow('Negative Prompt', negative, setNegative, true, 3)}

                <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
                <select value={size} onChange={e => setSize(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                {inputRow('Front Seed (optional)', seedInput, setSeedInput)}

                {progress && <p className="text-xs text-purple-400 mb-3">{progress}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setDraft(null)} disabled={generating} className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold">Back</button>
                  <button onClick={createCard} disabled={generating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {generating ? 'Summoning...' : 'Create Card'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EDIT */}
      {editing && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">Edit Card</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>{cardFront(editing)}</div>
              <div>{cardBack(editing)}</div>
            </div>

            {inputRow('Name', editing.name, v => setEditing({ ...editing, name: v }))}
            {inputRow('Title', editing.title, v => setEditing({ ...editing, title: v }))}
            {inputRow('Card Number', editing.card_number, v => setEditing({ ...editing, card_number: v }))}

            <label className="block text-xs text-gray-400 mb-1">Rarity</label>
            <select value={editing.rarity || 'common'} onChange={e => setEditing({ ...editing, rarity: e.target.value })}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {RARITIES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>

            {inputRow('Description', editing.description, v => setEditing({ ...editing, description: v }), true, 2)}
            {inputRow('Flavor Text', editing.flavor_text, v => setEditing({ ...editing, flavor_text: v }))}

            <label className="block text-xs text-gray-400 mb-1">Stats</label>
            {statEditor(editing.stats || [], arr => setEditing({ ...editing, stats: arr }))}

            <div className="border-t border-gray-800 pt-4 mt-2">
              <p className="text-xs text-gray-400 mb-2 font-semibold">Regenerate Art</p>

              {inputRow('Front Art Prompt', editing.image_prompt, v => setEditing({ ...editing, image_prompt: v }), true, 3)}
              {inputRow('Back Art Prompt', editing.back_image_prompt, v => setEditing({ ...editing, back_image_prompt: v }), true, 3)}
              {inputRow('Negative Prompt', editNegative, setEditNegative, true, 2)}

              <label className="block text-xs text-gray-400 mb-1">Add Art Style</label>
              <select value={editStyle} onChange={e => setEditStyle(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {ART_STYLES.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
              </select>

              <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
              <select value={editSize} onChange={e => setEditSize(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              {regenProgress && <p className="text-xs text-purple-400 mb-2">{regenProgress}</p>}

              <div className="flex gap-2 mb-4">
                <button onClick={() => regenSide('front')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regenerate Front</button>
                <button onClick={() => regenSide('back')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regenerate Back</button>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            <button onClick={() => deleteCard(editing)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-3">
              Delete Card
            </button>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {selected && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg my-6" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase text-gray-500 mb-2 text-center tracking-widest">Front</p>
                {cardFront(selected)}
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500 mb-2 text-center tracking-widest">Back</p>
                {cardBack(selected)}
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
                  {selected.seed && <button onClick={() => copy(selected.seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Back seed</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{selected.back_seed ?? '—'}</span>
                  {selected.back_seed && <button onClick={() => copy(selected.back_seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
            </div>

            <button onClick={() => openEdit(selected)} className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-2 text-sm font-semibold mt-3">Edit Card</button>
            <button onClick={() => deleteCard(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">Delete Card</button>
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
