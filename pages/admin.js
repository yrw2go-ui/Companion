// pages/admin.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { loadAppConfig, saveAppConfig, DEFAULT_APP_CONFIG } from '../lib/appConfig'

const input = 'w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500'
const label = 'text-[11px] uppercase tracking-wide text-gray-500 mb-1'

export default function Admin() {
  const router = useRouter()
  const [cfg, setCfg] = useState(null)
  const [savedSnap, setSavedSnap] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadAppConfig().then(({ config, error }) => {
      if (error) setMsg(error.message || 'Could not load app_config. Run the SQL first.')
      setCfg(config)
      setSavedSnap(JSON.stringify(config))
    })
  }, [])

  const dirty = cfg && JSON.stringify(cfg) !== savedSnap

  const setPrompt = (key, value) => setCfg(c => ({ ...c, prompts: { ...c.prompts, [key]: value } }))
  const setTab = (key, value) => setCfg(c => ({ ...c, tabs: { ...c.tabs, [key]: value } }))
  const setEdition = (key, value) => setCfg(c => ({ ...c, editions: { ...c.editions, [key]: Number(value) || 0 } }))
  const setPrice = (key, value) => setCfg(c => ({ ...c, prices: { ...c.prices, [key]: Number(value) || 0 } }))
  const setBuyback = (key, value) => setCfg(c => ({ ...c, prices: { ...c.prices, buyback: { ...c.prices.buyback, [key]: Number(value) || 0 } } }))

  const updateStyle = (i, patch) => setCfg(c => {
    const artStyles = c.artStyles.map((s, idx) => idx === i ? { ...s, ...patch } : s)
    return { ...c, artStyles }
  })
  const addStyle = () => setCfg(c => ({ ...c, artStyles: [...c.artStyles, { label: 'New style', prompt: '' }] }))
  const removeStyle = (i) => {
    if (!confirm('Remove this style from the create dropdown? Existing images are not changed.')) return
    setCfg(c => ({ ...c, artStyles: c.artStyles.filter((_, idx) => idx !== i) }))
  }

  const updateExtra = (ci, patch) => setCfg(c => ({
    ...c,
    promptExtras: c.promptExtras.map((cat, i) => i === ci ? { ...cat, ...patch } : cat),
  }))
  const updateOption = (ci, oi, patch) => setCfg(c => ({
    ...c,
    promptExtras: c.promptExtras.map((cat, i) => i !== ci ? cat : {
      ...cat,
      options: cat.options.map((o, j) => j === oi ? { ...o, ...patch } : o),
    }),
  }))
  const addCategory = () => setCfg(c => ({
    ...c,
    promptExtras: [...c.promptExtras, { id: 'cat_' + Date.now(), label: 'New category', options: [] }],
  }))
  const addOption = (ci) => setCfg(c => ({
    ...c,
    promptExtras: c.promptExtras.map((cat, i) => i !== ci ? cat : {
      ...cat,
      options: [...cat.options, { id: 'opt_' + Date.now(), label: 'New', text: '' }],
    }),
  }))
  const removeCategory = (ci) => {
    if (!confirm('Remove this chip category from image create?')) return
    setCfg(c => ({ ...c, promptExtras: c.promptExtras.filter((_, i) => i !== ci) }))
  }
  const removeOption = (ci, oi) => setCfg(c => ({
    ...c,
    promptExtras: c.promptExtras.map((cat, i) => i !== ci ? cat : {
      ...cat,
      options: cat.options.filter((_, j) => j !== oi),
    }),
  }))

  const save = async () => {
    if (!cfg) return
    const ok = confirm('Save these defaults?\n\nThis changes create-image styles, negative prompt, tab wording, edition sizes, and BabeBucks prices for new actions. Cards and images already made are not rewritten.')
    if (!ok) return
    setBusy(true)
    setMsg('')
    const { error } = await saveAppConfig(cfg)
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setSavedSnap(JSON.stringify(cfg))
    setMsg('Saved.')
  }

  const reset = () => {
    if (!confirm('Reset the form to built-in defaults? Nothing is saved until you press Save.')) return
    setCfg(JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)))
  }

  if (!cfg) return <div className="min-h-screen bg-black text-white p-6">Loading admin…</div>

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <div className="sticky top-0 z-20 bg-black/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => router.push('/settings')} className="text-gray-400 text-sm">← Settings</button>
        <h1 className="font-bold flex-1">Admin defaults</h1>
        <button type="button" onClick={save} disabled={busy || !dirty} className="bg-pink-600 disabled:bg-gray-700 rounded-lg px-3 py-1.5 text-sm font-semibold">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-8">
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        <p className="text-xs text-gray-500">Edits apply to new creates and new shop actions after save. A warning shows before anything is written.</p>

        <section>
          <h2 className="font-bold mb-2">Prompt defaults</h2>
          <p className={label}>Negative prompt</p>
          <textarea className={input + ' min-h-[90px] mb-3'} value={cfg.prompts.negative} onChange={e => setPrompt('negative', e.target.value)} />
          <p className={label}>Stylized extra negative</p>
          <textarea className={input + ' min-h-[70px] mb-3'} value={cfg.prompts.stylizedNegative} onChange={e => setPrompt('stylizedNegative', e.target.value)} />
          <p className={label}>Card front hint</p>
          <input className={input + ' mb-3'} value={cfg.prompts.cardFrontHint} onChange={e => setPrompt('cardFrontHint', e.target.value)} />
          <p className={label}>Card back hint</p>
          <input className={input} value={cfg.prompts.cardBackHint} onChange={e => setPrompt('cardBackHint', e.target.value)} />
        </section>

        <section>
          <h2 className="font-bold mb-2">Customer wording</h2>
          {Object.entries(cfg.tabs).map(([key, value]) => (
            <div key={key} className="mb-3">
              <p className={label}>{key}</p>
              <input className={input} value={value} onChange={e => setTab(key, e.target.value)} />
            </div>
          ))}
        </section>

        <section>
          <h2 className="font-bold mb-1">Edition size defaults</h2>
          <p className="text-[11px] text-gray-500 mb-2">How many of each rarity exist unless you override a card.</p>
          {Object.entries(cfg.editions).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 mb-2">
              <span className="w-28 text-sm capitalize">{key}</span>
              <input type="number" className={input} value={value} onChange={e => setEdition(key, e.target.value)} />
            </div>
          ))}
        </section>

        <section>
          <h2 className="font-bold mb-1">BabeBucks prices</h2>
          <p className="text-[11px] text-gray-500 mb-2">Shop costs. Sell-back is below.</p>
          {Object.entries(cfg.prices).filter(([k]) => k !== 'buyback').map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 mb-2">
              <span className="w-32 text-sm">{key}</span>
              <input type="number" className={input} value={value} onChange={e => setPrice(key, e.target.value)} />
            </div>
          ))}
          <p className="text-sm font-semibold mt-3 mb-2">Sell back to system</p>
          {Object.entries(cfg.prices.buyback).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 mb-2">
              <span className="w-32 text-sm capitalize">{key}</span>
              <input type="number" className={input} value={value} onChange={e => setBuyback(key, e.target.value)} />
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Image style dropdown</h2>
            <button type="button" onClick={addStyle} className="text-pink-400 text-sm">+ Add</button>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">Label is what you see. Prompt is what gets added to the image prompt.</p>
          {cfg.artStyles.map((s, i) => (
            <div key={i} className="border border-gray-800 rounded-xl p-3 mb-3">
              <div className="flex justify-between mb-2">
                <p className="text-xs text-gray-500">Style {i + 1}</p>
                <button type="button" onClick={() => removeStyle(i)} className="text-xs text-red-400">Remove</button>
              </div>
              <p className={label}>Label</p>
              <input className={input + ' mb-2'} value={s.label} onChange={e => updateStyle(i, { label: e.target.value })} />
              <p className={label}>Prompt added</p>
              <textarea className={input + ' min-h-[70px]'} value={s.prompt} onChange={e => updateStyle(i, { prompt: e.target.value })} />
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Prompt chips</h2>
            <button type="button" onClick={addCategory} className="text-pink-400 text-sm">+ Category</button>
          </div>
          {cfg.promptExtras.map((cat, ci) => (
            <div key={cat.id || ci} className="border border-gray-800 rounded-xl p-3 mb-3">
              <div className="flex justify-between gap-2 mb-2">
                <input className={input} value={cat.label} onChange={e => updateExtra(ci, { label: e.target.value })} />
                <button type="button" onClick={() => removeCategory(ci)} className="text-xs text-red-400 shrink-0">Remove</button>
              </div>
              {(cat.options || []).map((o, oi) => (
                <div key={o.id || oi} className="grid grid-cols-2 gap-2 mb-2">
                  <input className={input} value={o.label} placeholder="Label" onChange={e => updateOption(ci, oi, { label: e.target.value })} />
                  <input className={input} value={o.text} placeholder="Prompt text" onChange={e => updateOption(ci, oi, { text: e.target.value })} />
                  <button type="button" onClick={() => removeOption(ci, oi)} className="text-[11px] text-gray-500 text-left col-span-2">Remove chip</button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(ci)} className="text-xs text-pink-400">+ Chip</button>
            </div>
          ))}
        </section>

        <button type="button" onClick={reset} className="w-full border border-gray-700 rounded-xl py-3 text-sm text-gray-300">Reset form to built-in defaults</button>
      </div>
    </div>
  )
}
