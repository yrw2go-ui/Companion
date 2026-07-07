// pages/create.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function CreateCharacter() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    age: '',
    appearance: '',
    personality: '',
    speaking_style: '',
    backstory: '',
    relationship: '',
  })

  const update = (field, value) => {
    setForm({ ...form, [field]: value })
  }

  const save = async () => {
    if (!form.name.trim()) {
      alert('Please give your character a name')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('characters')
      .insert([{
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        appearance: form.appearance,
        personality: form.personality,
        speaking_style: form.speaking_style,
        backstory: form.backstory,
        relationship: form.relationship,
      }])
      .select()
      .single()

    setSaving(false)
    if (error) {
      alert('Error saving: ' + error.message)
      return
    }
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

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Character</h1>

      {field('Name', 'name', 'e.g. Aria')}
      {field('Age', 'age', 'e.g. 28')}
      {field('Appearance', 'appearance', 'How they look', true)}
      {field('Personality', 'personality', 'Witty, warm, sarcastic...', true)}
      {field('Speaking Style', 'speaking_style', 'Casual, poetic, blunt...', true)}
      {field('Backstory', 'backstory', 'Their history and background', true)}
      {field('Relationship to You', 'relationship', 'Friend, partner, mentor...', true)}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold mt-2"
      >
        {saving ? 'Saving...' : 'Save Character'}
      </button>
    </div>
  )
}
