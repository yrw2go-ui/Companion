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
    speaking_style: '', backstory: '', relationship: '', sample_dialogue: '',
  })
  const [memories, setMemories] = useState([])
  const [newMemory, setNewMemory] = useState('')

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
        sample_dialogue: data.sample_dialogue || '',
      })
    }
    await loadMemories()
    setLoading(false)
  }

  const loadMemories = async () => {
    const { data } = await supabase
      .from('core_memories')
      .select('*')
      .eq('character_id', id)
      .order('created_at', { ascending: true })
    setMemories(data || [])
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
        sample_dialogue: form.sample_dialogue,
      })
      .eq('id', id)
    setSaving(false)
    if
