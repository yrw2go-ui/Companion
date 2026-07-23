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
  const [importResult, setImportResult] = useState(null)

  const [clearingAudio, setClearingAudio] = useState(false)
  const [audioResult, setAudioResult] = useState(null)

  const [posterizing, setPosterizing] = useState(false)
  const [posterStatus, setPosterStatus] = useState('')

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

  const backfillPosters = async () => {
    if (posterizing) return
    setPosterizing(true)
    setPosterStatus('Finding videos without posters...')

    try {
      // gallery videos missing a poster
      const { data: gal } = await supabase
        .from('gallery_media')
        .select('id, url, poster_url')
        .eq('type', 'video')

      const galMissing = (gal || []).filter(g => g.url && !g.poster_url)

      // animated cards missing a poster
      const { data: cards } = await supabase
        .from('cards')
        .select('id, video_url, poster_url')

      const cardMissing = (cards || []).filter(c => c.video_url && !c.poster_url)

      const total = galMissing.length + cardMissing.length
      if (total === 0) {
        setPosterStatus('All videos already have posters.')
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

      setPosterStatus(`Done. Created ${done - failed} poster(s)${failed ? `, ${failed} could not be read` : ''}.`)
    } catch (err) {
      setPosterStatus('Error: ' + err.message)
    }
    setPosterizing(false)
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
    </div>
  )
}
