import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Settings() {
  const router = useRouter()

  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('user_settings')
      .select('my_description')
      .eq('id', 1)
      .single()

    if (error) {
      console.error(error)
      alert(error.message)
    } else {
      setDescription(data?.my_description || '')
    }

    setLoading(false)
  }

  async function save() {
    setSaving(true)

    const { data, error } = await supabase
      .from('user_settings')
      .update({
        my_description: description
      })
      .eq('id', 1)
      .select()

    setSaving(false)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    if (!data || data.length === 0) {
      alert('Nothing was updated. Check your Supabase RLS policies.')
      return
    }

    alert('Saved successfully!')
    router.push('/')
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
        <button
          onClick={() => router.push('/')}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back
        </button>

        <h1 className="text-xl font-bold">Settings</h1>

        <div className="w-12" />
      </div>

      <label className="block text-sm text-gray-400 mb-1">
        How I Appear (global)
      </label>

      <p className="text-xs text-gray-600 mb-3">
        Your description for "us together" images. Individual characters can override this.
      </p>

      <textarea
        rows={5}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. 30yo man, short dark hair, brown eyes, athletic build, casual clothes"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none mb-5"
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>

    </div>
  )
}
