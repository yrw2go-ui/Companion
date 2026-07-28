// pages/settings.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import { makePoster } from '../lib/posterFrame'

export default function Settings() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedValue, setSavedValue] = useState('')

  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState(null)

  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [orphanInfo, setOrphanInfo] = useState(null)
  const [dupScanning, setDupScanning] = useState(false)
  const [dupInfo, setDupInfo] = useState(null)
  const [dupDeleting, setDupDeleting] = useState(false)
  const [dupResult, setDupResult] = useState(null)
  const [keepChoice, setKeepChoice] = useState({})  // groupIndex -> fileName to KEEP

  const [fixScanning, setFixScanning] = useState(false)
  const [fixInfo, setFixInfo] = useState(null)
  const [fixResult, setFixResult] = useState(null)
  const [importResult, setImportResult] = useState(null)

  const [clearingAudio, setClearingAudio] = useState(false)
  const [audioResult, setAudioResult] = useState(null)

  const [posterizing, setPosterizing] = useState(false)
  const [posterStatus, setPosterStatus] = useState('')

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetStatus, setResetStatus] = useState('')
  const [resetResult, setResetResult] = useState(null)

  const [emptyingStorage, setEmptyingStorage] = useState(false)
  const [emptyStorageResult, setEmptyStorageResult] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('my_description')
      .eq('id', 1)
      .maybeSingle()
    const loaded = data?.my_description || ''
    setDescription(loaded)
    setSavedValue(loaded)
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: 1, my_description: description })
    setSaving(false)
    if (error) {
      alert('Could not save: ' + error.message)
      return
    }
    setSaved(true)
    setSavedValue(description)
  }

  const cleanup = async () => {
    if (cleaning) return
    if (!confirm('Delete all images, audio, and video older than 90 days? Cards and character images are kept. This cannot be undone.')) return

    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/cleanup-media', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setCleanResult('Error: ' + data.error)
      } else {
        setCleanResult(`Deleted ${data.deleted} old file${data.deleted === 1 ? '' : 's'} (scanned ${data.scanned}, kept ${data.protectedCount} in use).`)
      }
    } catch (err) {
      setCleanResult('Error: ' + err.message)
    }
    setCleaning(false)
  }

  const scanBrokenLinks = async () => {
    if (fixScanning) return
    setFixScanning(true)
    setFixInfo(null)
    setFixResult(null)
    try {
      const res = await fetch('/api/fix-broken-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (data.error) setFixResult('Error: ' + data.error)
      else setFixInfo(data)
    } catch (err) {
      setFixResult('Error: ' + err.message)
    }
    setFixScanning(false)
  }

  const removeBrokenLinks = async () => {
    if (!fixInfo?.brokenCount) return
    if (!confirm(`Remove ${fixInfo.brokenCount} gallery entr${fixInfo.brokenCount === 1 ? 'y' : 'ies'} whose file no longer exists?`)) return
    setFixScanning(true)
    try {
      const res = await fetch('/api/fix-broken-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      if (data.error) setFixResult('Error: ' + data.error)
      else {
        setFixResult(`Removed ${data.removed} broken entr${data.removed === 1 ? 'y' : 'ies'}.`)
        setFixInfo(null)
      }
    } catch (err) {
      setFixResult('Error: ' + err.message)
    }
    setFixScanning(false)
  }

  const scanDuplicates = async () => {
    if (dupScanning) return
    setDupScanning(true)
    setDupInfo(null)
    setDupResult(null)
    try {
      const res = await fetch('/api/find-duplicates', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setDupResult('Error: ' + data.error)
      } else {
        setDupInfo(data)
        // default to keeping the oldest file in each group
        const defaults = {}
        data.groups?.forEach((g, i) => { defaults[i] = g.files[0].name })
        setKeepChoice(defaults)
      }
    } catch (err) {
      setDupResult('Error: ' + err.message)
    }
    setDupScanning(false)
  }

  const deleteDuplicateGroup = async (group, groupIndex) => {
    const keep = keepChoice[groupIndex]
    const toDelete = group.files.map(f => f.name).filter(n => n !== keep)
    if (toDelete.length === 0) return
    if (!confirm(`Delete ${toDelete.length} duplicate file(s), keeping "${keep}"?`)) return

    setDupDeleting(true)
    try {
      const res = await fetch('/api/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames: toDelete }),
      })
      const data = await res.json()
      if (data.error) {
        alert('Error: ' + data.error)
      } else {
        // remove this group from the list locally
        setDupInfo(prev => ({
          ...prev,
          groups: prev.groups.filter((_, i) => i !== groupIndex),
        }))
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setDupDeleting(false)
  }

  const deleteAllDuplicates = async () => {
    if (!dupInfo?.groups?.length) return
    const allToDelete = dupInfo.groups.flatMap((g, i) => {
      const keep = keepChoice[i]
      return g.files.map(f => f.name).filter(n => n !== keep)
    })
    if (allToDelete.length === 0) return
    if (!confirm(`Delete ${allToDelete.length} duplicate file(s) across ${dupInfo.groups.length} group(s)? This keeps one copy from each group.`)) return

    setDupDeleting(true)
    try {
      const res = await fetch('/api/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames: allToDelete }),
      })
      const data = await res.json()
      if (data.error) {
        setDupResult('Error: ' + data.error)
      } else {
        setDupResult(`Deleted ${data.deleted} duplicate file(s), cleared ${data.clearedRows} record(s).`)
        setDupInfo(null)
      }
    } catch (err) {
      setDupResult('Error: ' + err.message)
    }
    setDupDeleting(false)
  }

  const scanOrphans = async () => {
    if (scanning) return
    setScanning(true)
    setOrphanInfo(null)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (data.error) setImportResult('Error: ' + data.error)
      else setOrphanInfo(data)
    } catch (err) {
      setImportResult('Error: ' + err.message)
    }
    setScanning(false)
  }

  const runOrphans = async (mode) => {
    if (importing) return
    const count = orphanInfo?.orphanCount || 0
    const question = mode === 'delete'
      ? `Permanently delete ${count} orphaned file(s) from storage? This cannot be undone.`
      : `Import ${count} file(s) into the gallery?`
    if (!confirm(question)) return

    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, mode }),
      })
      const data = await res.json()
      if (data.error) {
        setImportResult('Error: ' + data.error)
      } else if (mode === 'delete') {
        setImportResult(`Deleted ${data.deleted} orphaned file(s).`)
        setOrphanInfo(null)
      } else {
        setImportResult(`Imported ${data.imported} file(s) into the gallery.`)
        setOrphanInfo(null)
      }
    } catch (err) {
      setImportResult('Error: ' + err.message)
    }
    setImporting(false)
  }

  // does this image URL actually load? broken/blank posters return false
  // a poster is "good" only if it loads AND isn't a flat black/blank frame
  const posterLoads = (url) => new Promise((resolve) => {
    if (!url) { resolve(false); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let done = false
    const finish = (ok) => { if (!done) { done = true; resolve(ok) } }
    img.onload = () => {
      if (!img.naturalWidth) { finish(false); return }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let min = 255, max = 0
        const step = Math.max(4, Math.floor((canvas.width * canvas.height) / 2000)) * 4
        for (let i = 0; i < data.length; i += step) {
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
          if (lum < min) min = lum
          if (lum > max) max = lum
        }
        // flat frame (black/blank) => treat as bad so it gets regenerated
        finish((max - min) >= 12)
      } catch {
        // tainted canvas: can't inspect, assume it's fine so we don't loop forever
        finish(true)
      }
    }
    img.onerror = () => finish(false)
    setTimeout(() => finish(false), 6000)
    img.src = url
  })

  const backfillPosters = async () => {
    if (posterizing) return
    setPosterizing(true)
    setPosterStatus('Checking existing thumbnails...')

    try {
      // gallery videos missing a poster
      const { data: gal } = await supabase
        .from('gallery_media')
        .select('id, url, poster_url')
        .eq('type', 'video')

      // include videos with no poster AND those whose poster no longer loads
      const galCandidates = (gal || []).filter(g => g.url)
      const galMissing = []
      for (const g of galCandidates) {
        if (!g.poster_url) { galMissing.push(g); continue }
        const ok = await posterLoads(g.poster_url)
        if (!ok) galMissing.push(g)
      }

      // animated cards missing a poster
      const { data: cards } = await supabase
        .from('cards')
        .select('id, video_url, poster_url')

      const cardCandidates = (cards || []).filter(c => c.video_url)
      const cardMissing = []
      for (const c of cardCandidates) {
        if (!c.poster_url) { cardMissing.push(c); continue }
        const ok = await posterLoads(c.poster_url)
        if (!ok) cardMissing.push(c)
      }

      // chat videos missing a poster
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, content, poster_url')
        .eq('role', 'video')

      const msgCandidates = (msgs || []).filter(m => m.content && m.content !== 'generating')
      const msgMissing = []
      for (const m of msgCandidates) {
        if (!m.poster_url) { msgMissing.push(m); continue }
        const ok = await posterLoads(m.poster_url)
        if (!ok) msgMissing.push(m)
      }

      const total = galMissing.length + cardMissing.length + msgMissing.length
      if (total === 0) {
        setPosterStatus('All videos already have working thumbnails.')
        setPosterizing(false)
        return
      }

      let done = 0
      let failed = 0

      for (const g of galMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(g.url)
        if (poster) {
          await supabase.from('gallery_media').update({ poster_url: poster }).eq('id', g.id)
        } else {
          failed++
        }
        done++
      }

      for (const c of cardMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(c.video_url)
        if (poster) {
          await supabase.from('cards').update({ poster_url: poster }).eq('id', c.id)
        } else {
          failed++
        }
        done++
      }

      for (const m of msgMissing) {
        setPosterStatus(`Generating posters... ${done + 1} of ${total}`)
        const poster = await makePoster(m.content)
        if (poster) {
          await supabase.from('messages').update({ poster_url: poster }).eq('id', m.id)
        } else {
          failed++
        }
        done++
      }

      setPosterStatus(`Done. Created ${done - failed} poster(s)${failed ? `, ${failed} could not be read` : ''}.`)
    } catch (err) {
      setPosterStatus('Error: ' + err.message)
    }
    setPosterizing(false)
  }

  const runResetAll = async () => {
    if (resetting) return
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      alert('Type RESET to confirm')
      return
    }
    setResetting(true)
    setResetStatus('Deleting folders...')
    setResetResult(null)
    try {
      await supabase.from('folder_items').delete().neq('item_key', '')
      await supabase.from('gallery_folders').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Deleting gallery media...')
      await supabase.from('gallery_media').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Deleting chat images/videos...')
      await supabase.from('messages').delete().in('role', ['image', 'video'])

      setResetStatus('Deleting cards...')
      await supabase.from('cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Deleting characters...')
      await supabase.from('characters').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      setResetStatus('Wiping storage files...')
      const storageRes = await fetch('/api/empty-storage', { method: 'POST' })
      const storageData = await storageRes.json()
      if (storageData.error) throw new Error('Storage wipe failed: ' + storageData.error)

      setResetStatus('')
      setResetting(false)
      setShowResetModal(false)
      setResetConfirmText('')
      setResetResult('All data wiped: gallery, chat media, cards, characters, folders, and storage files.')
    } catch (err) {
      setResetting(false)
      setResetStatus('')
      setResetResult('Error: ' + err.message)
    }
  }

  const emptyStorageBucket = async () => {
    if (emptyingStorage) return
    if (!confirm('Delete EVERY file in the character-images storage bucket (including folders)? This cannot be undone.')) return
    setEmptyingStorage(true)
    setEmptyStorageResult('Working (server-side)...')
    try {
      const res = await fetch('/api/empty-storage', { method: 'POST' })
      const data = await res.json()
      if (data.error) setEmptyStorageResult('Error: ' + data.error)
      else setEmptyStorageResult(`Done. Removed ${data.deleted} file(s) (scanned ${data.scanned}).`)
    } catch (err) {
      setEmptyStorageResult('Error: ' + err.message)
    }
    setEmptyingStorage(false)
  }

  const clearAudio = async () => {
    if (clearingAudio) return
    setClearingAudio(true)
    setAudioResult(null)
    try {
      // count first so the confirmation is meaningful
      const scanRes = await fetch('/api/clear-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const scan = await scanRes.json()
      if (scan.error) {
        setAudioResult('Error: ' + scan.error)
        setClearingAudio(false)
        return
      }
      if (!scan.audioCount) {
        setAudioResult('No audio files found.')
        setClearingAudio(false)
        return
      }
      if (!confirm(`Delete all ${scan.audioCount} audio file(s)? Voice lines will regenerate when replayed.`)) {
        setClearingAudio(false)
        return
      }

      const res = await fetch('/api/clear-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      if (data.error) setAudioResult('Error: ' + data.error)
      else setAudioResult(`Deleted ${data.deleted} audio file(s).`)
    } catch (err) {
      setAudioResult('Error: ' + err.message)
    }
    setClearingAudio(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Settings</h1>
        <span className="w-12"></span>
      </div>

      <label className="block text-sm text-gray-400 mb-1">How I Appear</label>
      <p className="text-xs text-gray-600 mb-2">
        Used when you appear in generated images. Individual characters can override this.
      </p>
      <textarea
        value={description}
        onChange={e => {
          setDescription(e.target.value)
          if (saved) setSaved(false)
        }}
        placeholder="e.g. 40yr old man, dark hair, short beard, athletic build"
        rows={4}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none mb-4"
      />

      <button
        onClick={save}
        disabled={saving || description === savedValue}
        className={`w-full rounded-lg py-3 font-semibold ${
          description === savedValue
            ? 'bg-gray-700 text-gray-400 cursor-default'
            : 'bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {saving ? 'Saving...' : description === savedValue ? 'Saved' : 'Save'}
      </button>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Fix Broken Links</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds gallery entries whose file no longer exists in storage (e.g. deleted by mistake
          elsewhere) and removes the leftover entry so it stops showing as broken.
        </p>

        <button
          onClick={scanBrokenLinks}
          disabled={fixScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {fixScanning ? 'Scanning...' : 'Scan for broken links'}
        </button>

        {fixInfo && (
          <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
            {fixInfo.brokenCount === 0 ? (
              <p className="text-xs text-gray-400">No broken links found.</p>
            ) : (
              <>
                <p className="text-xs text-gray-300 mb-2">
                  Found {fixInfo.brokenCount} entr{fixInfo.brokenCount === 1 ? 'y' : 'ies'} pointing at missing files.
                </p>
                <ul className="text-[10px] text-gray-500 mb-3 space-y-0.5">
                  {fixInfo.sample.map(s => (
                    <li key={s.id} className="truncate">{s.type}: {s.prompt || '(no prompt)'}</li>
                  ))}
                  {fixInfo.brokenCount > fixInfo.sample.length && (
                    <li className="text-gray-600">...and {fixInfo.brokenCount - fixInfo.sample.length} more</li>
                  )}
                </ul>
                <button
                  onClick={removeBrokenLinks}
                  disabled={fixScanning}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold"
                >
                  Remove {fixInfo.brokenCount} broken entr{fixInfo.brokenCount === 1 ? 'y' : 'ies'}
                </button>
              </>
            )}
          </div>
        )}

        {fixResult && <p className="text-xs text-gray-400 mt-3">{fixResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Find Duplicates</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds files that look like accidental duplicates — same base name with a (1)/(2)-style
          suffix and matching file size. Pick which copy to keep in each group.
        </p>

        <button
          onClick={scanDuplicates}
          disabled={dupScanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {dupScanning ? 'Scanning...' : 'Scan for duplicates'}
        </button>

        {dupInfo && (
          <div className="mt-3 space-y-3">
            {dupInfo.groupCount === 0 ? (
              <p className="text-xs text-gray-400">No likely duplicates found.</p>
            ) : (
              <>
                <p className="text-xs text-gray-300">
                  Found {dupInfo.groupCount} group(s), {dupInfo.totalDuplicateFiles} extra file(s) that could be removed.
                </p>

                {dupInfo.groups.map((g, i) => (
                  <div key={g.baseKey} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 font-mono mb-2 truncate">{g.baseKey}</p>
                    {g.files.map(f => (
                      <label key={f.name} className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                        <input
                          type="radio"
                          name={`keep-${i}`}
                          checked={keepChoice[i] === f.name}
                          onChange={() => setKeepChoice(prev => ({ ...prev, [i]: f.name }))}
                        />
                        <span className="font-mono truncate flex-1">{f.name}</span>
                        <span className="text-gray-600">{f.size ? `${Math.round(f.size / 1024)}KB` : ''}</span>
                      </label>
                    ))}
                    <p className="text-[10px] text-gray-600 mt-1 mb-2">Keeping the selected file, deleting the rest in this group.</p>
                    <button
                      onClick={() => deleteDuplicateGroup(g, i)}
                      disabled={dupDeleting}
                      className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold"
                    >
                      Delete duplicates in this group
                    </button>
                  </div>
                ))}

                <button
                  onClick={deleteAllDuplicates}
                  disabled={dupDeleting}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-3 font-semibold"
                >
                  {dupDeleting ? 'Working...' : `Delete all ${dupInfo.totalDuplicateFiles} duplicate(s)`}
                </button>
              </>
            )}
          </div>
        )}

        {dupResult && <p className="text-xs text-gray-400 mt-3">{dupResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Import Orphaned Media</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds files in storage that nothing in the app points at. These are usually leftovers from
          earlier deletions, or clips made on the test page. Import the ones worth keeping, or delete
          them to free up storage.
        </p>

        <button
          onClick={scanOrphans}
          disabled={scanning}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {scanning ? 'Scanning...' : 'Scan for orphaned files'}
        </button>

        {orphanInfo && (
          <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-300 mb-2">
              Found {orphanInfo.orphanCount} orphaned file(s) out of {orphanInfo.scanned} scanned.
            </p>
            {orphanInfo.sample?.length > 0 && (
              <ul className="text-[10px] text-gray-500 font-mono mb-3 space-y-0.5">
                {orphanInfo.sample.map(n => <li key={n} className="truncate">{n}</li>)}
                {orphanInfo.orphanCount > orphanInfo.sample.length && (
                  <li className="text-gray-600">...and {orphanInfo.orphanCount - orphanInfo.sample.length} more</li>
                )}
              </ul>
            )}
            {orphanInfo.orphanCount > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => runOrphans('import')}
                  disabled={importing}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-2 text-sm font-semibold"
                >
                  {importing ? 'Working...' : `Import ${orphanInfo.orphanCount} into gallery`}
                </button>
                <button
                  onClick={() => runOrphans('delete')}
                  disabled={importing}
                  className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold"
                >
                  {importing ? 'Working...' : `Delete ${orphanInfo.orphanCount} from storage`}
                </button>
              </div>
            )}
          </div>
        )}

        {importResult && <p className="text-xs text-gray-400 mt-3">{importResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Video Thumbnails</h2>
        <p className="text-xs text-gray-600 mb-3">
          Generates still thumbnails for existing videos so the gallery no longer loads full videos
          just to show them. This is the main fix for high storage bandwidth. Keep this tab open while it runs.
        </p>

        <button
          onClick={backfillPosters}
          disabled={posterizing}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {posterizing ? 'Working...' : 'Generate thumbnails for existing videos'}
        </button>

        {posterStatus && <p className="text-xs text-gray-400 mt-3">{posterStatus}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Clear Voice Audio</h2>
        <p className="text-xs text-gray-600 mb-3">
          Deletes every voice clip in storage, whatever its age. Lines regenerate automatically
          the next time you play them.
        </p>

        <button
          onClick={clearAudio}
          disabled={clearingAudio}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {clearingAudio ? 'Working...' : 'Delete all audio files'}
        </button>

        {audioResult && <p className="text-xs text-gray-400 mt-3">{audioResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Storage Cleanup</h2>
        <p className="text-xs text-gray-600 mb-3">
          Deletes chat and gallery media (images, audio, video) that's 90 days old or older.
          Card art and character images are always kept.
        </p>

        <button
          onClick={cleanup}
          disabled={cleaning}
          className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {cleaning ? 'Cleaning up...' : 'Delete media older than 90 days'}
        </button>

        {cleanResult && (
          <p className="text-xs text-gray-400 mt-3">{cleanResult}</p>
        )}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Empty Storage Bucket</h2>
        <p className="text-xs text-gray-600 mb-3">
          Force-deletes every file in the character-images bucket, even if the app still
          thinks they are in use. Use this when orphan scan shows files but the gallery is empty.
        </p>
        <button
          onClick={emptyStorageBucket}
          disabled={emptyingStorage}
          className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {emptyingStorage ? 'Emptying...' : 'Empty storage bucket'}
        </button>
        {emptyStorageResult && <p className="text-xs text-gray-400 mt-3">{emptyStorageResult}</p>}
      </div>

      <div className="mt-10 border-t border-gray-800 pt-6 mb-10">
        <h2 className="font-semibold mb-1 text-red-400">Reset All Data</h2>
        <p className="text-xs text-gray-600 mb-3">
          Permanently deletes <strong>everything</strong>: gallery media, chat images/videos,
          all cards, all characters, all folders, and all files in storage.
          This cannot be undone.
        </p>

        <button
          onClick={() => { setShowResetModal(true); setResetConfirmText(''); setResetResult(null) }}
          disabled={resetting}
          className="w-full bg-red-950 hover:bg-red-900 disabled:opacity-50 border border-red-800 rounded-lg py-3 font-semibold text-red-300"
        >
          Wipe everything...
        </button>

        {resetResult && <p className="text-xs text-gray-400 mt-3">{resetResult}</p>}
      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-5 z-50">
          <div className="bg-gray-900 border border-red-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="font-bold text-lg text-red-400 mb-2">Confirm Full Reset</h2>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              This will permanently delete:
              <br />• All gallery images, videos, 3D models
              <br />• All chat images &amp; videos
              <br />• All cards
              <br />• All characters
              <br />• All folders
              <br />• All storage files
              <br /><br />
              Type <span className="font-mono text-red-300">RESET</span> to confirm.
            </p>
            <input
              autoFocus
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runResetAll() }}
              placeholder="Type RESET"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-red-500 font-mono"
            />
            {resetStatus && <p className="text-xs text-gray-500 mb-3">{resetStatus}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText('') }}
                disabled={resetting}
                className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={runResetAll}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="flex-1 bg-red-900 hover:bg-red-800 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg py-3 font-semibold"
              >
                {resetting ? 'Wiping...' : 'Wipe All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}