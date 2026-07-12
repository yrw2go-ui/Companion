import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Settings() {
  const router = useRouter()

  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [debug, setDebug] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error) {
      setDebug('LOAD ERROR:\n' + JSON.stringify(error, null, 2))
    } else {
      setDescription(data?.my_description || '')
      setDebug('Loaded row:\n' + JSON.stringify(data, null, 2))
    }

    setLoading(false)
  }

  async function save() {
    setSaving(true)

    const result = await supabase
      .from('user_settings')
      .update({
        my_description: description
      })
      .eq('id', 1)
      .select()

    setSaving(false)

    setDebug(JSON.stringify(result, null, 2))
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

      <button
        onClick={() => router.push('/')}
        className="text-gray-400 mb-6"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <label className="block mb-2">
        How I Appear (global)
      </label>

      <textarea
        rows={5}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded p-3 mb-4"
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 rounded p-3"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>

      <pre className="mt-6 text-xs bg-gray-900 p-3 rounded overflow-auto whitespace-pre-wrap">
        {debug}
      </pre>

    </div>
  )
}
