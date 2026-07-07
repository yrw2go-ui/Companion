// pages/edit/[id].js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

export default function EditCharacter() {
  const router = useRouter()
  const { id } = router.query
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '', age: '', appearance: '', personality: '',
    speaking_style: '', backstory: '', relationship: '',
  })

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  const load = async () => {
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single()
    if (data) {
      setForm({
        name: data.name || '',
        age: data.age || '',
        appearance: data.appearance || '',
        personality: data.personality || '',
        speaking_style: data.speaking_style || '',
        backstory: data.backstory || '',
        relationship: data.relationship || '',
      })
    }
    setLoading(false)
  }

  const update = (field, value) => setForm({ ...form, [field]: value })

  const save = async () => {
    if (!form.name.trim()) {
      alert('Please give your character a name')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('characters')
      .update({
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        appearance: form.appearance,
        personality: form.personality,
        speaking_style: form.speaking_style,
        backstory: form.backstory,
        relationship: form.relationship,
      })
      .eq('id', id)
    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    router.push(`/chat/${id}`)
  }

  const del = async () => {
    if (!confirm('Delete this character permanently?')) return
    await supabase.from('characters').delete().eq('id', id)
    router.push('/')
  }

  const field = (label, key, placeholder, multiline = false) => (
    <div className="mb-4">
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => update(key, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        />
      ) : (
        <input
          value={form[key]}
          onChange={e => update(key, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
        />
      )}
    </div>
  )

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push(`/chat/${id}`)} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Edit Character</h1>
        <span className="w-12"></span>
      </div>

      {field('Name', 'name', 'e.g. Aria')}
      {field('Age', 'age', 'e.g. 28')}
      {field('Appearance', 'appearance', 'How they look', true)}
      {field('Personality', 'personality', 'Witty, warm, sarcastic...', true)}
      {field('Speaking Style', 'speaking_style', 'Casual, poetic, blunt...', true)}
      {field('Backstory', 'backstory', 'Their history', true)}
      {field('Relationship to You', 'relationship', 'Friend, partner, mentor...', true)}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mt-2"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <button
        onClick={del}
        className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-3 font-semibold mt-3"
      >
        Delete Character
      </button>
    </div>
  )
                 }
