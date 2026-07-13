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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
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
    </div>
  )
}
