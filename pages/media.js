// pages/media.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

// Same qty list as card creation (numbers + labels for rarity defaults)
const EDITION_QTY_OPTIONS = [1, 5, 10, 25, 50, 100, 150, 200, 250, 300, 350, 500, 700, 1000, 2000]
const RARITY_EDITION_DEFAULTS = {
  common: 2000,
  uncommon: 1000,
  rare: 500,
  epic: 350,
  legendary: 250,
  'ultra elite': 150,
  'after hours': 50,
  mint: 1,
}
const rarityLabel = (r) =>
  String(r || 'common').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
const editionOptionLabel = (n) => {
  const num = Number(n)
  const rarities = Object.entries(RARITY_EDITION_DEFAULTS)
    .filter(([, v]) => v === num)
    .map(([k]) => rarityLabel(k))
  if (num === 1) return '1 · Mint (1 of 1)'
  if (rarities.length) return `${num} · ${rarities.join(', ')} default`
  return String(num)
}
const MISC_EDITION_DEFAULT = 1000

export default function MediaLibrary() {
  const router = useRouter()
  const [library, setLibrary] = useState('character') // character | misc
  const [items, setItems] = useState([])
  const [miscItems, setMiscItems] = useState([])
  const [folderDrafts, setFolderDrafts] = useState([]) // gallery folder "Misc Beauties" not yet in misc_items
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | image | video | live | off
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedKind, setSelectedKind] = useState('character') // character | misc | draft
  const [busy, setBusy] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editUnlock, setEditUnlock] = useState('shop')
  const [editCost, setEditCost] = useState('0')
  const [editEdition, setEditEdition] = useState(String(MISC_EDITION_DEFAULT))
  const [editChar, setEditChar] = useState('')
  const [editSort, setEditSort] = useState('1')
  const [editOverlayName, setEditOverlayName] = useState('')
  const [editOverlayFont, setEditOverlayFont] = useState('impact')
  const [editOverlayPos, setEditOverlayPos] = useState('h-top-left')
  const [editOverlaySize, setEditOverlaySize] = useState('md')
  const [miscSets, setMiscSets] = useState([])
  const [editSetMode, setEditSetMode] = useState('standalone') // standalone | existing | new
  const [editSetId, setEditSetId] = useState('')
  const [editSetName, setEditSetName] = useState('')
  const [editSetPrefix, setEditSetPrefix] = useState('')

  const NAME_FONTS = [
    { id: 'impact', label: 'Impact Bold', family: 'Impact, Haettenschweiler, sans-serif', weight: 900 },
    { id: 'arialblack', label: 'Arial Black', family: '"Arial Black", "Helvetica Neue", sans-serif', weight: 900 },
    { id: 'georgia', label: 'Georgia Bold', family: 'Georgia, "Times New Roman", serif', weight: 700 },
    { id: 'system', label: 'System ExtraBold', family: 'system-ui, -apple-system, sans-serif', weight: 800 },
    { id: 'mono', label: 'Mono Bold', family: 'ui-monospace, SFMono-Regular, Menlo, monospace', weight: 700 },
  ]
  const NAME_POSITIONS = [
    { id: 'h-top-left', label: 'Horizontal · top left' },
    { id: 'h-top-center', label: 'Horizontal · top middle' },
    { id: 'h-top-right', label: 'Horizontal · top right' },
    { id: 'h-bottom-left', label: 'Horizontal · bottom left' },
    { id: 'h-bottom-center', label: 'Horizontal · bottom middle' },
    { id: 'h-bottom-right', label: 'Horizontal · bottom right' },
    { id: 'v-upper-left', label: 'Vertical · upper left side' },
    { id: 'v-mid-left', label: 'Vertical · left side middle' },
    { id: 'v-upper-right', label: 'Vertical · upper right side' },
    { id: 'v-mid-right', label: 'Vertical · right side middle' },
  ]
  const NAME_SIZES = [
    { id: 'md', label: 'Default', fontSize: '0.85rem' },
    { id: 'lg', label: 'Large', fontSize: '1.1rem' },
    { id: 'xl', label: 'Extra large', fontSize: '1.35rem' },
    { id: 'xxl', label: 'Huge', fontSize: '1.65rem' },
  ]

  const nameOverlayStyle = (fontId, pos, sizeId = 'md') => {
    const f = NAME_FONTS.find(x => x.id === fontId) || NAME_FONTS[0]
    const sz = NAME_SIZES.find(s => s.id === sizeId) || NAME_SIZES[0]
    const base = {
      fontFamily: f.family,
      fontWeight: f.weight,
      color: '#fff',
      textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)',
      letterSpacing: '0.04em',
      pointerEvents: 'none',
      zIndex: 6,
      position: 'absolute',
      fontSize: sz.fontSize,
      lineHeight: 1.1,
      maxWidth: '70%',
      padding: '0 6px',
    }
    if (pos === 'h-top-left') return { ...base, top: 8, left: 8 }
    if (pos === 'h-top-center') return { ...base, top: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', maxWidth: '90%' }
    if (pos === 'h-top-right') return { ...base, top: 8, right: 8, textAlign: 'right' }
    if (pos === 'h-bottom-left') return { ...base, bottom: 8, left: 8 }
    if (pos === 'h-bottom-center') return { ...base, bottom: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', maxWidth: '90%' }
    if (pos === 'h-bottom-right') return { ...base, bottom: 8, right: 8, textAlign: 'right' }
    if (pos === 'v-upper-left') return { ...base, top: 12, left: 4, writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxWidth: 'none' }
    if (pos === 'v-mid-left') return { ...base, top: '50%', left: 4, writingMode: 'vertical-rl', transform: 'translateY(-50%) rotate(180deg)', maxWidth: 'none' }
    if (pos === 'v-upper-right') return { ...base, top: 12, right: 4, writingMode: 'vertical-rl', maxWidth: 'none' }
    if (pos === 'v-mid-right') return { ...base, top: '50%', right: 4, writingMode: 'vertical-rl', transform: 'translateY(-50%)', maxWidth: 'none' }
    return { ...base, top: 8, left: 8 }
  }

  // Ensure gallery row for url lives in "Misc Beauties" folder
  const ensureInMiscBeautiesFolder = async (url) => {
    if (!url) return
    try {
      let { data: folders } = await supabase.from('gallery_folders').select('*')
      let folder = (folders || []).find(f => String(f.name || '').trim().toLowerCase() === 'misc beauties')
      if (!folder) {
        const { data: created, error } = await supabase
          .from('gallery_folders')
          .insert([{ name: 'Misc Beauties' }])
          .select()
          .single()
        if (error) throw new Error(error.message)
        folder = created
      }
      const { data: galRows } = await supabase
        .from('gallery_media')
        .select('id, url, type')
        .eq('url', url)
      let galId = galRows?.[0]?.id
      if (!galId) {
        const type = /\.(mp4|webm|mov)(\?|$)/i.test(String(url)) ? 'video' : 'image'
        const { data: inserted } = await supabase
          .from('gallery_media')
          .insert([{ type, url, prompt: 'Misc Beauties', model: 'misc-publish' }])
          .select('id')
          .single()
        galId = inserted?.id
      }
      if (!galId) return
      const key = 'gal_' + galId
      await supabase.from('folder_items').delete().eq('item_key', key)
      await supabase.from('folder_items').delete().eq('item_key', String(galId))
      await supabase.from('folder_items').upsert(
        { source: 'gallery_media', item_key: key, folder_id: folder.id },
        { onConflict: 'source,item_key' }
      )
    } catch (e) {
      console.warn('ensureInMiscBeautiesFolder', e)
    }
  }

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('character_media')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setItems(data || [])

    const { data: misc, error: mErr } = await supabase
      .from('misc_items')
      .select('*, misc_sets(id, name, code_prefix)')
      .order('created_at', { ascending: false })
    if (mErr) console.error(mErr)
    const miscList = misc || []
    setMiscItems(miscList)

    const { data: sets } = await supabase.from('misc_sets').select('*').order('name')
    setMiscSets(sets || [])

    // Gallery folder named "Misc Beauties" → show as Off drafts until published into misc_items
    const drafts = []
    try {
      const { data: folders } = await supabase.from('gallery_folders').select('id, name')
      const folder = (folders || []).find(f => String(f.name || '').trim().toLowerCase() === 'misc beauties')
      if (folder) {
        const { data: fis } = await supabase
          .from('folder_items')
          .select('item_key, source')
          .eq('folder_id', folder.id)
        const galIds = []
        for (const fi of fis || []) {
          const k = String(fi.item_key || '')
          if (k.startsWith('gal_')) galIds.push(k.slice(4))
          else if (/^[0-9a-f-]{36}$/i.test(k)) galIds.push(k)
        }
        const uniq = [...new Set(galIds)]
        const publishedUrls = new Set(miscList.map(m => m.url).filter(Boolean))
        for (let i = 0; i < uniq.length; i += 100) {
          const chunk = uniq.slice(i, i + 100)
          const { data: gals } = await supabase
            .from('gallery_media')
            .select('id, url, type, prompt, created_at, poster_url, thumbnail_url')
            .in('id', chunk)
          for (const g of gals || []) {
            if (!g.url || publishedUrls.has(g.url)) continue
            drafts.push({
              id: 'draft_' + g.id,
              gallery_id: g.id,
              url: g.url,
              type: g.type === 'video' ? 'video' : 'image',
              title: g.prompt ? String(g.prompt).slice(0, 80) : null,
              published: false,
              _draft: true,
              created_at: g.created_at,
              poster_url: g.poster_url || g.thumbnail_url,
            })
          }
        }
      }
    } catch (e) {
      console.warn('misc folder drafts', e)
    }
    setFolderDrafts(drafts)
    setLoading(false)
  }

  const openItem = (m, kind = 'character') => {
    setSelectedKind(kind)
    setSelected(m)
    setEditTitle(m.title || '')
    setEditUnlock(m.unlock_method || 'shop')
    setEditCost(String(m.token_cost ?? 0))
    setEditEdition(String(
      m.edition_size != null && m.edition_size !== ''
        ? m.edition_size
        : (kind === 'misc' || kind === 'draft' ? MISC_EDITION_DEFAULT : 300)
    ))
    setEditChar(m.character_name || '')
    setEditSort(String(m.sort_index ?? 1))
    setEditOverlayName(m.overlay_name || m.character_name || '')
    setEditOverlayFont(m.overlay_font || 'impact')
    setEditOverlayPos(m.overlay_position || 'h-top-left')
    setEditOverlaySize(m.overlay_size || 'md')
    if (kind === 'misc' || kind === 'draft') {
      if (m.set_id && m.misc_sets) {
        setEditSetMode('existing')
        setEditSetId(m.set_id)
        setEditSetName('')
        setEditSetPrefix('')
      } else {
        setEditSetMode('standalone')
        setEditSetId('')
        setEditSetName('')
        setEditSetPrefix('')
      }
    }
  }

  const resolveSetForPublish = async () => {
    if (editSetMode === 'standalone') {
      return { setId: null, prefix: 'MX', setName: null }
    }
    if (editSetMode === 'existing') {
      if (!editSetId) throw new Error('Pick a set')
      const s = miscSets.find(x => x.id === editSetId)
      if (!s) throw new Error('Set not found')
      return { setId: s.id, prefix: s.code_prefix || 'MX', setName: s.name }
    }
    // new set — reuse if same name exists
    const wantedName = editSetName.trim()
    if (!wantedName) throw new Error('Set name required')
    const existing = (miscSets || []).find(
      s => String(s.name || '').trim().toLowerCase() === wantedName.toLowerCase()
    )
    if (existing) {
      return { setId: existing.id, prefix: existing.code_prefix || 'MX', setName: existing.name }
    }
    const { data: dbHits } = await supabase.from('misc_sets').select('*').ilike('name', wantedName)
    const hit = (dbHits || []).find(
      s => String(s.name || '').trim().toLowerCase() === wantedName.toLowerCase()
    )
    if (hit) {
      setMiscSets(prev => (prev.some(x => x.id === hit.id) ? prev : [...prev, hit].sort((a, b) => a.name.localeCompare(b.name))))
      return { setId: hit.id, prefix: hit.code_prefix || 'MX', setName: hit.name }
    }
    const prefix = (editSetPrefix || wantedName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'SET'
    const { data: created, error } = await supabase.from('misc_sets').insert([{
      name: wantedName,
      code_prefix: prefix,
    }]).select().single()
    if (error) {
      if (/unique|duplicate/i.test(error.message || '')) {
        const { data: again } = await supabase.from('misc_sets').select('*').ilike('name', wantedName)
        const reuse = (again || [])[0]
        if (!reuse) throw new Error(error.message)
        return { setId: reuse.id, prefix: reuse.code_prefix || prefix, setName: reuse.name }
      }
      throw new Error(error.message)
    }
    setMiscSets(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
    return { setId: created.id, prefix: created.code_prefix || prefix, setName: created.name }
  }

  const nextPublicId = async (prefix) => {
    const p = (prefix || 'MX').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'MX'
    const { data } = await supabase
      .from('misc_items')
      .select('public_id')
      .ilike('public_id', p + '%')
      .order('public_id', { ascending: false })
      .limit(50)
    let maxN = 102000
    for (const row of data || []) {
      const m = String(row.public_id || '').match(/(\d+)$/)
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
    }
    return p + String(maxN + 1)
  }

  // Publish a gallery-folder draft into misc_items (with optional set)
  const publishDraft = async (draft) => {
    if (!draft?._draft || busy) return
    setBusy(true)
    try {
      const { setId, prefix, setName } = await resolveSetForPublish()
      let sortIndex = 1
      if (setId) {
        const { count } = await supabase
          .from('misc_items')
          .select('id', { count: 'exact', head: true })
          .eq('set_id', setId)
        sortIndex = (count || 0) + 1
      }
      const publicId = await nextPublicId(prefix)
      const overlayName = editOverlayName.trim() || null
      const editionSize = parseInt(editEdition, 10) || MISC_EDITION_DEFAULT
      const { data, error } = await supabase.from('misc_items').insert([{
        set_id: setId,
        type: draft.type === 'video' ? 'video' : 'image',
        url: draft.url,
        title: (editTitle.trim() || draft.title) || null,
        public_id: publicId,
        sort_index: Math.max(1, parseInt(editSort) || sortIndex),
        edition_size: editionSize,
        published: true,
        overlay_name: overlayName,
        overlay_font: overlayName ? editOverlayFont : null,
        overlay_position: overlayName ? editOverlayPos : null,
        overlay_size: overlayName ? editOverlaySize : null,
      }]).select('*, misc_sets(id, name, code_prefix)').single()
      if (error) throw new Error(error.message)
      // Auto-file into Gallery → Misc Beauties folder
      await ensureInMiscBeautiesFolder(draft.url)
      setFolderDrafts(prev => prev.filter(x => x.id !== draft.id))
      setMiscItems(prev => [data, ...prev])
      setSelected(data)
      setSelectedKind('misc')
      setEditSetMode(setId ? 'existing' : 'standalone')
      setEditSetId(setId || '')
      alert(setName ? `Published as ${publicId} · ${setName}` : `Published as ${publicId} (standalone)`)
    } catch (err) {
      alert('Publish failed: ' + err.message)
    }
    setBusy(false)
  }

  const togglePublish = async (m, kind = selectedKind) => {
    if (kind === 'draft' || m._draft) {
      await publishDraft(m)
      return
    }
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
    if (!selected || busy || selected._draft) return
    setBusy(true)
    const overlayName = editOverlayName.trim() || null
    try {
      if (selectedKind === 'misc') {
        const sortN = Math.max(1, parseInt(editSort) || 1)
        const { setId } = await resolveSetForPublish()
        const payload = {
          title: editTitle.trim() || null,
          sort_index: sortN,
          set_id: setId,
          edition_size: parseInt(editEdition, 10) || MISC_EDITION_DEFAULT,
          overlay_name: overlayName,
          overlay_font: overlayName ? editOverlayFont : null,
          overlay_position: overlayName ? editOverlayPos : null,
          overlay_size: overlayName ? editOverlaySize : null,
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
        if (setId) {
          setEditSetMode('existing')
          setEditSetId(setId)
        } else {
          setEditSetMode('standalone')
          setEditSetId('')
        }
      } else {
        const payload = {
          title: editTitle.trim() || null,
          unlock_method: editUnlock,
          token_cost: parseInt(editCost) || 0,
          edition_size: parseInt(editEdition, 10) || 300,
          character_name: editChar.trim() || selected.character_name,
          overlay_name: overlayName,
          overlay_font: overlayName ? editOverlayFont : null,
          overlay_position: overlayName ? editOverlayPos : null,
          overlay_size: overlayName ? editOverlaySize : null,
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
    if (m._draft || kind === 'draft') {
      alert('This is only in the Gallery “Misc Beauties” folder. Remove it from that folder in Gallery if you don’t want it here.')
      return
    }
    const label = kind === 'misc' ? 'misc beauty listing' : 'character media'
    if (!confirm(`Delete this ${label}?`)) return
    const table = kind === 'misc' ? 'misc_items' : 'character_media'
    const { error } = await supabase.from(table).delete().eq('id', m.id)
    if (error) { alert(error.message); return }
    if (kind === 'misc') setMiscItems(prev => prev.filter(x => x.id !== m.id))
    else setItems(prev => prev.filter(x => x.id !== m.id))
    if (selected?.id === m.id) setSelected(null)
  }

  const matchesSearch = (m, kind) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const setName = m.misc_sets?.name || ''
    const hay = kind === 'misc' || kind === 'draft'
      ? `${m.public_id || ''} ${m.title || ''} ${setName} ${m.overlay_name || ''}`.toLowerCase()
      : `${m.character_name || ''} ${m.title || ''} ${m.unlock_method || ''}`.toLowerCase()
    return hay.includes(q)
  }

  const filterRow = (m, kind) => {
    if (filter === 'image' && m.type !== 'image') return false
    if (filter === 'video' && m.type !== 'video') return false
    if (filter === 'live' && !m.published) return false
    if (filter === 'off' && m.published) return false
    if (!matchesSearch(m, kind)) return false
    return true
  }

  const visibleChar = items.filter(m => filterRow(m, 'character'))
  const visibleMisc = miscItems.filter(m => filterRow(m, 'misc'))
  const visibleDrafts = folderDrafts.filter(m => filterRow(m, 'draft'))

  // Off tab for misc = unpublished misc_items + gallery folder drafts
  const showDraftsInMisc = library === 'misc' && (filter === 'all' || filter === 'off' || filter === 'image' || filter === 'video')

  const byChar = {}
  for (const m of visibleChar) {
    const k = m.character_name || 'Unlinked'
    if (!byChar[k]) byChar[k] = []
    byChar[k].push(m)
  }
  const charNames = Object.keys(byChar).sort((a, b) => a.localeCompare(b))

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
  for (const g of setGroups) {
    g.items.sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0) || String(a.public_id || '').localeCompare(String(b.public_id || '')))
  }

  const miscTotal = miscItems.length + folderDrafts.length
  const miscLive = miscItems.filter(x => x.published).length
  const charLive = items.filter(x => x.published).length
  const totalCount = library === 'misc' ? miscTotal : items.length
  const liveCount = library === 'misc' ? miscLive : charLive

  const setSize = (item) => {
    if (!item?.set_id) return null
    return miscItems.filter(x => x.set_id === item.set_id).length
  }

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

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setLibrary('character'); setSelected(null); setFilter('all') }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border ${
              library === 'character' ? 'bg-pink-700 border-pink-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            Character media
          </button>
          <button
            type="button"
            onClick={() => { setLibrary('misc'); setSelected(null); setFilter('all') }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border ${
              library === 'misc' ? 'bg-pink-700 border-pink-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            Misc Beauties
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          {library === 'character'
            ? 'Extra media linked from cards. Live items appear in game media draws. Edit edition size (e.g. 1 of 200).'
            : 'Gallery folder “Misc Beauties” shows under Off until published. Sets stay grouped. Edit order in set.'}
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
                          <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded z-[6] ${m.published ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                            {m.published ? 'Live' : 'Off'}
                          </span>
                          <span className="absolute bottom-2 left-2 text-[9px] bg-black/70 px-1.5 py-0.5 rounded">
                            ed. {m.edition_size || '—'}
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold truncate">{m.title || m.type}</p>
                          <p className="text-[10px] text-gray-500">{m.unlock_method} · {m.type}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          visibleMisc.length === 0 && !(showDraftsInMisc && visibleDrafts.length) ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              <p>No Misc Beauties yet.</p>
              <p className="mt-2 text-xs">Put files in Gallery folder “Misc Beauties”, or Add to Misc Beauties from a file.</p>
              <button onClick={() => router.push('/gallery')} className="mt-4 text-pink-400 hover:text-pink-300 text-sm font-semibold">
                Go to Gallery →
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {showDraftsInMisc && visibleDrafts.length > 0 && (filter === 'all' || filter === 'off') && (
                <div>
                  <h2 className="text-sm font-semibold text-amber-300 mb-2 sticky top-0 bg-black/90 py-1 z-10">
                    Gallery folder · Misc Beauties
                    <span className="text-gray-600 font-normal ml-2">{visibleDrafts.length} off</span>
                  </h2>
                  <p className="text-[10px] text-gray-500 mb-2">Not published to shop yet. Open → Set Live to add.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visibleDrafts.map(m => (
                      <button
                        key={m.id}
                        onClick={() => openItem(m, 'draft')}
                        className="text-left bg-gray-900 border border-amber-900/40 rounded-xl overflow-hidden hover:border-amber-600 transition"
                      >
                        <div className="relative aspect-[3/4] bg-gray-800">
                          {m.type === 'video' ? (
                            <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                          )}
                          <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded z-[6] bg-gray-700 text-gray-300">
                            Off
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold truncate">{m.title || 'Folder item'}</p>
                          <p className="text-[10px] text-amber-500/80">From gallery folder</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {setGroups.map(g => {
                const setTotal = g.items.length
                return (
                  <div key={g.key}>
                    <h2 className="text-sm font-semibold text-pink-300 mb-2 sticky top-0 bg-black/90 py-1 z-10 flex items-center gap-2 flex-wrap">
                      <span>{g.name}</span>
                      {g.code && <span className="text-[10px] font-mono text-gray-500">{g.code}</span>}
                      <span className="text-gray-600 font-normal">{setTotal} item{setTotal === 1 ? '' : 's'}</span>
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
                            <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded z-[6] ${m.published ? 'bg-emerald-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                              {m.published ? 'Live' : 'Off'}
                            </span>
                            <span className="absolute bottom-2 left-2 text-[9px] bg-black/70 px-1.5 py-0.5 rounded font-mono">
                              {m.sort_index != null ? `${m.sort_index} of ${setTotal}` : (m.public_id || m.type)}
                            </span>
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-semibold truncate">{m.title || m.public_id || 'Misc'}</p>
                            <p className="text-[10px] text-gray-500 truncate">{m.public_id}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => setSelected(null)}>
          <div
            className="bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold">
                {selectedKind === 'draft' ? 'Gallery folder item' : selectedKind === 'misc' ? 'Misc Beauty' : 'Media detail'}
              </h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
            </div>

            <p className="text-[10px] text-gray-500 mb-1">Live preview (game overlays)</p>
            <div className="relative rounded-xl overflow-hidden bg-black mb-4 aspect-[3/4] max-h-[55vh] mx-auto w-full">
              {selected.type === 'video' ? (
                <video src={selected.url} controls className="absolute inset-0 w-full h-full object-cover object-top" playsInline />
              ) : (
                <img src={selected.url} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
              )}
              {/* Name overlay — uses live edit fields */}
              {(editOverlayName || selected.overlay_name) && (
                <span style={nameOverlayStyle(
                  editOverlayFont || selected.overlay_font,
                  editOverlayPos || selected.overlay_position,
                  editOverlaySize || selected.overlay_size || 'md'
                )}>
                  {editOverlayName || selected.overlay_name}
                </span>
              )}
              {/* Misc: public ID + set */}
              {(selectedKind === 'misc' || selectedKind === 'draft') && (
                <div className="absolute top-2 left-2 bg-black/80 rounded-lg px-2 py-1.5 max-w-[70%] z-[5]">
                  <p className="text-[10px] font-mono text-pink-300">
                    {selected.public_id || (selectedKind === 'draft' ? 'ID on publish' : '—')}
                  </p>
                  <p className="text-[9px] text-white truncate">
                    {selected.misc_sets?.name
                      || (editSetMode === 'existing' && miscSets.find(s => s.id === editSetId)?.name)
                      || (editSetMode === 'new' && editSetName.trim())
                      || 'Standalone'}
                  </p>
                  {selectedKind === 'misc' && selected.sort_index != null && (
                    <p className="text-[9px] text-gray-300 mt-0.5">
                      {selected.sort_index} of {setSize(selected) || '—'} in set
                    </p>
                  )}
                </div>
              )}
              {/* Character +media label */}
              {selectedKind === 'character' && (selected.character_name || editChar) && (
                <div className="absolute top-2 left-2 bg-black/75 rounded-lg px-2 py-1 z-[5] max-w-[65%]">
                  <p className="text-[10px] text-pink-200 truncate">{editChar || selected.character_name}</p>
                  <p className="text-[9px] text-gray-400 truncate">{editTitle || selected.title || selected.type}</p>
                </div>
              )}
              {/* Edition badge */}
              <div className="absolute bottom-2 left-2 z-[5] bg-black/75 rounded-md px-2 py-1">
                <p className="text-[10px] text-amber-300 font-semibold">
                  1 of {editEdition || (selectedKind === 'character' ? 300 : MISC_EDITION_DEFAULT)}
                </p>
              </div>
              {/* COMP-GA logo */}
              <img
                src="/ga-mark.png"
                alt=""
                className="absolute top-2 right-2 object-contain drop-shadow-lg pointer-events-none z-[5]"
                style={{ height: '3.75rem', width: '3.75rem' }}
              />
              {selected.published && (
                <span className="absolute bottom-2 right-2 z-[5] text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-black">
                  Live
                </span>
              )}
            </div>

            {selectedKind === 'draft' && (
              <p className="text-xs text-amber-200/90 mb-3">
                In Gallery folder “Misc Beauties” only — pick a set below, then Set Live.
              </p>
            )}

            {selectedKind === 'misc' && (
              <div className="mb-3 text-xs text-gray-400 space-y-1">
                <p><span className="text-gray-500">Public ID:</span> <span className="font-mono text-pink-300">{selected.public_id || '—'}</span></p>
                <p><span className="text-gray-500">Set:</span> {selected.misc_sets?.name || 'Standalone'}</p>
                <p>
                  <span className="text-gray-500">Position in set:</span>{' '}
                  {selected.sort_index != null ? `${selected.sort_index} of ${setSize(selected) || '—'}` : '—'}
                </p>
              </div>
            )}

            {(selectedKind === 'misc' || selectedKind === 'draft') && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Set</label>
                <select
                  value={editSetMode}
                  onChange={e => {
                    const v = e.target.value
                    setEditSetMode(v)
                    if (v === 'standalone') setEditSetId('')
                  }}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                >
                  <option value="standalone">Standalone (no set)</option>
                  <option value="existing">Existing set</option>
                  <option value="new">＋ New set…</option>
                </select>
                {editSetMode === 'existing' && (
                  <select
                    value={editSetId}
                    onChange={e => setEditSetId(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                  >
                    <option value="">Select set…</option>
                    {miscSets.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code_prefix})</option>
                    ))}
                  </select>
                )}
                {editSetMode === 'new' && (
                  <>
                    <input
                      value={editSetName}
                      onChange={e => setEditSetName(e.target.value)}
                      placeholder="New set name"
                      className="w-full bg-black border border-pink-800 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                    />
                    <input
                      value={editSetPrefix}
                      onChange={e => setEditSetPrefix(e.target.value)}
                      placeholder="Code prefix (optional, e.g. TD)"
                      className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                    />
                  </>
                )}
              </div>
            )}

            {selectedKind === 'character' && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Character name</label>
                <input value={editChar} onChange={e => setEditChar(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />
              </>
            )}

            {(selectedKind === 'misc' || selectedKind === 'draft' || selectedKind === 'character') && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Name overlay (optional)</label>
                <input
                  value={editOverlayName}
                  onChange={e => setEditOverlayName(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
                />
                {editOverlayName.trim() && (
                  <>
                    <label className="block text-[10px] text-gray-600 mb-1">Font</label>
                    <select value={editOverlayFont} onChange={e => setEditOverlayFont(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
                      {NAME_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <label className="block text-[10px] text-gray-600 mb-1">Position</label>
                    <select value={editOverlayPos} onChange={e => setEditOverlayPos(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
                      {NAME_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <label className="block text-[10px] text-gray-600 mb-1">Text size</label>
                    <select value={editOverlaySize} onChange={e => setEditOverlaySize(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                      {NAME_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </>
                )}

                <label className="block text-xs text-gray-500 mb-1">Title</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500" />
              </>
            )}

            {(selectedKind === 'misc' || selectedKind === 'draft') && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Order in set (1, 2, 3…)</label>
                <input
                  value={editSort}
                  onChange={e => setEditSort(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500"
                />
                <p className="text-[10px] text-gray-600 mb-3 -mt-2">
                  Shown as “{editSort || 1} of …” on the tile when in a set.
                </p>
                <label className="block text-xs text-gray-500 mb-1">How many available (edition size)</label>
                <select
                  value={String(
                    EDITION_QTY_OPTIONS.includes(Number(editEdition))
                      ? Number(editEdition)
                      : MISC_EDITION_DEFAULT
                  )}
                  onChange={e => setEditEdition(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-pink-500"
                >
                  {EDITION_QTY_OPTIONS.map(n => (
                    <option key={n} value={n}>{editionOptionLabel(n)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-600 mb-3">
                  Default for Misc Beauties: <span className="text-pink-300 font-semibold">{MISC_EDITION_DEFAULT}</span>.
                  {' '}Same list as card creation (labels show rarity defaults).
                </p>
              </>
            )}

            {selectedKind === 'character' && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Unlock</label>
                <select
                  value={['shop', 'mine', 'both'].includes(editUnlock) ? editUnlock : 'shop'}
                  onChange={e => setEditUnlock(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-pink-500"
                >
                  <option value="shop">Shop</option>
                  <option value="mine">Mine</option>
                  <option value="both">Both</option>
                </select>
                <p className="text-[10px] text-gray-600 mb-3 -mt-2">Price is set in the Shop. Cost is not edited here.</p>
                <label className="block text-xs text-gray-500 mb-1">How many available (edition size)</label>
                <select
                  value={String(
                    EDITION_QTY_OPTIONS.includes(Number(editEdition))
                      ? Number(editEdition)
                      : 300
                  )}
                  onChange={e => setEditEdition(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-pink-500"
                >
                  {EDITION_QTY_OPTIONS.map(n => (
                    <option key={n} value={n}>{editionOptionLabel(n)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mb-3">
                  Players get numbered copies like “3 of {editEdition || 300}”. Same labeled list as card creation.
                </p>
              </>
            )}

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => togglePublish(selected, selectedKind)}
                disabled={busy}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold disabled:opacity-50 ${
                  selected.published ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {selected._draft ? (busy ? 'Publishing…' : 'Set Live') : (selected.published ? 'Live ✓ (tap = Off)' : 'Set Live')}
              </button>
              {selectedKind !== 'draft' && (
                <button onClick={saveEdit} disabled={busy}
                  className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg py-3 text-sm font-semibold">
                  {busy ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
            {selectedKind !== 'draft' && (
              <button onClick={() => deleteItem(selected, selectedKind)}
                className="w-full bg-red-900/80 hover:bg-red-800 rounded-lg py-3 text-sm font-semibold">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
