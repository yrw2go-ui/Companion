// pages/game.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Game() {
  const router = useRouter()
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const trackRef = useRef(null)

  useEffect(() => {
    loadBanners()
  }, [])

  const loadBanners = async () => {
    // Prefer favorites, then newest gallery images
    let { data } = await supabase
      .from('gallery_media')
      .select('id, url, prompt, is_favorite')
      .eq('type', 'image')
      .eq('is_favorite', true)
      .order('created_at', { ascending: false })
      .limit(24)

    if (!data || data.length < 4) {
      const { data: recent } = await supabase
        .from('gallery_media')
        .select('id, url, prompt, is_favorite')
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(24)
      data = recent || []
    }

    setBanners(data)
    setLoading(false)
  }

  // seamless infinite scroll: duplicate list
  const strip = banners.length ? [...banners, ...banners] : []

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* top bar */}
      <div className="fixed top-0 inset-x-0 z-40 bg-black/70 backdrop-blur border-b border-white/10">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <button onClick={() => router.push('/settings')} className="text-xs text-gray-400 hover:text-white">
            ⚙ Mode
          </button>
          <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-pink-400">Arena</h1>
          <button onClick={() => router.push('/gallery')} className="text-xs text-gray-400 hover:text-white">
            Studio
          </button>
        </div>
      </div>

      {/* hero banner strip */}
      <div className="pt-14">
        <div className="relative h-56 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-pink-600/20 via-transparent to-black z-10 pointer-events-none" />
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">Loading...</div>
          ) : banners.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm px-6 text-center">
              Favorite some images in Studio — they appear here as banners.
            </div>
          ) : (
            <div
              ref={trackRef}
              className="flex h-full gap-2 animate-marquee"
              style={{ width: 'max-content' }}
            >
              {strip.map((b, i) => (
                <div key={`${b.id}-${i}`} className="relative h-56 w-40 shrink-0 overflow-hidden rounded-xl">
                  <img src={b.url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* second slower strip for depth */}
      {banners.length > 0 && (
        <div className="relative h-36 overflow-hidden mt-2 opacity-80">
          <div
            className="flex h-full gap-2 animate-marquee-slow"
            style={{ width: 'max-content' }}
          >
            {[...banners].reverse().concat([...banners].reverse()).map((b, i) => (
              <div key={`r-${b.id}-${i}`} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg">
                <img src={b.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* game nav cards */}
      <div className="max-w-lg mx-auto px-4 mt-8 space-y-3 pb-24">
        <p className="text-[10px] tracking-[0.25em] uppercase text-gray-500 mb-1">Play</p>

        <button className="w-full text-left bg-gradient-to-r from-pink-700 to-purple-800 rounded-2xl p-4 active:scale-[0.98] transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg">Mystery Packs</p>
              <p className="text-xs text-pink-200/80 mt-0.5">Spend tokens · unlock rare cards</p>
            </div>
            <span className="text-2xl">🎴</span>
          </div>
        </button>

        <button className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Collection</p>
              <p className="text-xs text-gray-500 mt-0.5">Your cards & unlockable media</p>
            </div>
            <span className="text-2xl">💎</span>
          </div>
        </button>

        <button className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Trade</p>
              <p className="text-xs text-gray-500 mt-0.5">Swap cards with others</p>
            </div>
            <span className="text-2xl">🔄</span>
          </div>
        </button>

        <button className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Duel</p>
              <p className="text-xs text-gray-500 mt-0.5">Head-to-head card stacks</p>
            </div>
            <span className="text-2xl">⚔️</span>
          </div>
        </button>

        <div className="mt-8 rounded-2xl border border-pink-900/40 bg-pink-950/30 p-4">
          <p className="text-xs text-pink-300 font-semibold mb-1">Tokens</p>
          <p className="text-3xl font-bold">0</p>
          <p className="text-[10px] text-gray-500 mt-1">Buy / earn later — placeholder</p>
        </div>
      </div>

      {/* bottom tab bar */}
      <div className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-lg mx-auto grid grid-cols-4 text-center py-2 text-[10px] text-gray-500">
          <button className="py-2 text-pink-400">
            <div className="text-lg">🏠</div>
            Home
          </button>
          <button className="py-2">
            <div className="text-lg">🎴</div>
            Packs
          </button>
          <button className="py-2">
            <div className="text-lg">💎</div>
            Cards
          </button>
          <button className="py-2">
            <div className="text-lg">⚔️</div>
            Duel
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-slow {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee-slow {
          animation: marquee-slow 55s linear infinite;
        }
      `}</style>
    </div>
  )
}
