// pages/settings.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Settings() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState(null)

  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [orphanInfo, setOrphanInfo] = useState(null)
  const [importResult, setImportResult] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('my_description')
      .eq('id', 1)
      .maybeSingle()
    setDescription(data?.my_description || '')
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
    setTimeout(() => setSaved(false), 2000)
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

  const runImport = async () => {
    if (importing) return
    if (!confirm(`Import ${orphanInfo?.orphanCount || 0} file(s) into the gallery?`)) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      if (data.error) setImportResult('Error: ' + data.error)
      else {
        setImportResult(`Imported ${data.imported} file(s) into the gallery.`)
        setOrphanInfo(null)
      }
    } catch (err) {
      setImportResult('Error: ' + err.message)
    }
    setImporting(false)
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
        onChange={e => setDescription(e.target.value)}
        placeholder="e.g. 40yr old man, dark hair, short beard, athletic build"
        rows={4}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none mb-4"
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold"
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
      </button>

      <div className="mt-10 border-t border-gray-800 pt-6">
        <h2 className="font-semibold mb-1">Import Orphaned Media</h2>
        <p className="text-xs text-gray-600 mb-3">
          Finds files in storage that aren't showing anywhere in the app, such as videos made on the test page,
          and adds them to the gallery.
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
              <button
                onClick={runImport}
                disabled={importing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-2 text-sm font-semibold"
              >
                {importing ? 'Importing...' : `Import ${orphanInfo.orphanCount} into gallery`}
              </button>
            )}
          </div>
        )}

        {importResult && <p className="text-xs text-gray-400 mt-3">{importResult}</p>}
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
