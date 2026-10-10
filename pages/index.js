// pages/index.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const router = useRouter()
  const [appMode, setAppMode] = useState('creator') // 'creator' | 'public'
  const [modeSaving, setModeSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('app_mode')
        .eq('id', 1)
        .maybeSingle()
      if (cancelled) return
      const mode = data?.app_mode === 'public' ? 'public' : 'creator'
      setAppMode(mode)
      setLoading(false)
      // Auto-open game if last mode was public
      if (mode === 'public' && typeof window !== 'undefined') {
        const skip = sessionStorage.getItem('skip_auto_game')
        if (!skip) router.replace('/game')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const setMode = async (mode) => {
    if (modeSaving || mode === appMode) {
      if (mode === 'public') router.push('/game')
      return
    }
    setModeSaving(true)
    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: 1, app_mode: mode })
    setModeSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setAppMode(mode)
    if (mode === 'public') {
      sessionStorage.removeItem('skip_auto_game')
      router.push('/game')
    } else {
      sessionStorage.setItem('skip_auto_game', '1')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 pt-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Companion</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="w-10 h-10 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-lg"
              aria-label="Settings"
            >
              ⚙
            </button>
            <button
              type="button"
              onClick={() => router.push('/create')}
              className="bg-purple-600 hover:bg-purple-500 rounded-full px-4 py-2 text-sm font-semibold"
            >
              + New
            </button>
          </div>
        </div>

        {/* Creator ↔ Game mode toggle */}
        <div className="mb-6 rounded-2xl border border-gray-800 bg-gray-950 p-1.5 flex gap-1">
          <button
            type="button"
            disabled={modeSaving}
            onClick={() => setMode('creator')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              appMode === 'creator'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Creator
          </button>
          <button
            type="button"
            disabled={modeSaving}
            onClick={() => setMode('public')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              appMode === 'public'
                ? 'bg-pink-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Game
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          <button
            type="button"
            onClick={() => router.push('/gallery')}
            className="text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition"
          >
            <div className="text-2xl mb-2">🖼️</div>
            <p className="font-semibold">Gallery</p>
            <p className="text-xs text-gray-500 mt-0.5">Images &amp; videos</p>
          </button>
          <button
            type="button"
            onClick={() => router.push('/cards')}
            className="text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition"
          >
            <div className="text-2xl mb-2">🃏</div>
            <p className="font-semibold">Cards</p>
            <p className="text-xs text-gray-500 mt-0.5">Collect characters</p>
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-2">Characters</p>
        <p className="text-sm text-gray-600">
          No characters yet. Tap &quot;+ New&quot; to create one.
        </p>
      </div>
    </div>
  )
}
