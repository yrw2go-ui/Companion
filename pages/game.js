// pages/game.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Game() {
  const router = useRouter()
  const [banners, setBanners] = useState([])
  const [publishedCards, setPublishedCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('home') // home | packs | cards | duel

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    // published cards for collection only (not banners)
    const { data: cards } = await supabase
      .from('cards')
      .select('id, name, card_number, image_url, back_image_url, video_url, poster_url, published, rarity')
      .eq('published', true)
      .order('created_at', { ascending: false })

    setPublishedCards(cards || [])

    // banners: gallery images only (favorites first)
    let banners = []
    const { data: favs } = await supabase
      .from('gallery_media')
      .select('id, url, prompt')
      .eq('type', 'image')
      .eq('is_favorite', true)
      .order('created_at', { ascending: false })
      .limit(24)
    banners = (favs || []).map(f => ({ id: 'gal_' + f.id, url: f.url, prompt: f.prompt }))

    if (banners.length < 4) {
      const { data: recent } = await supabase
        .from('gallery_media')
        .select('id, url, prompt')
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(24)
      const extra = (recent || []).map(f => ({ id: 'gal_' + f.id, url: f.url, prompt: f.prompt }))
      const seen = new Set(banners.map(b => b.id))
      for (const e of extra) {
        if (!seen.has(e.id)) banners.push(e)
      }
      banners = banners.slice(0, 24)
    }

    setBanners(banners)
    setLoading(false)
  }

  const strip = banners.length ? [...banners, ...banners] : []

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
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

      {tab === 'home' && (
        <>
          <div className="pt-14">
            <div className="relative h-56 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-pink-600/20 via-transparent to-black z-10 pointer-events-none" />
              {loading ? (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm">Loading...</div>
              ) : banners.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm px-6 text-center">
                  Publish cards or favorite images in Studio to fill the banners.
                </div>
              ) : (
                <div className="flex h-full gap-2 animate-marquee" style={{ width: 'max-content' }}>
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

          {banners.length > 0 && (
            <div className="relative h-36 overflow-hidden mt-2 opacity-80">
              <div className="flex h-full gap-2 animate-marquee-slow" style={{ width: 'max-content' }}>
                {[...banners].reverse().concat([...banners].reverse()).map((b, i) => (
                  <div key={`r-${b.id}-${i}`} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg">
                    <img src={b.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-lg mx-auto px-4 mt-8 space-y-3 pb-24">
            <p className="text-[10px] tracking-[0.25em] uppercase text-gray-500 mb-1">Play</p>

            <button onClick={() => setTab('packs')} className="w-full text-left bg-gradient-to-r from-pink-700 to-purple-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">Mystery Packs</p>
                  <p className="text-xs text-pink-200/80 mt-0.5">Spend tokens · unlock rare cards</p>
                </div>
                <span className="text-2xl">🎴</span>
              </div>
            </button>

            <button onClick={() => setTab('cards')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">Collection</p>
                  <p className="text-xs text-gray-500 mt-0.5">{publishedCards.length} published card{publishedCards.length === 1 ? '' : 's'}</p>
                </div>
                <span className="text-2xl">💎</span>
              </div>
            </button>

            <button className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">Trade</p>
                  <p className="text-xs text-gray-500 mt-0.5">Coming soon</p>
                </div>
                <span className="text-2xl">🔄</span>
              </div>
            </button>

            <button onClick={() => setTab('duel')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">Duel</p>
                  <p className="text-xs text-gray-500 mt-0.5">Coming soon</p>
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
        </>
      )}

      {tab === 'cards' && (
        <div className="pt-16 max-w-lg mx-auto px-4 pb-24">
          <h2 className="font-bold text-lg mb-1">Collection</h2>
          <p className="text-xs text-gray-500 mb-4">Cards you published from Studio</p>
          {publishedCards.length === 0 ? (
            <p className="text-sm text-gray-600">No published cards yet. Open a card in Gallery and tap Publish to game.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {publishedCards.map(c => (
                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="w-full aspect-[3/4] object-cover blur-md scale-110" />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-gray-800" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-2xl">🔒</span>
                  </div>
                  <div className="p-2 relative bg-gray-900">
                    <p className="text-xs font-semibold truncate text-gray-400">???</p>
                    <p className="text-[10px] text-gray-600">{c.rarity || 'card'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'packs' && (
        <div className="pt-16 max-w-lg mx-auto px-4 pb-24">
          <h2 className="font-bold text-lg mb-1">Mystery Packs</h2>
          <p className="text-xs text-gray-500 mb-6">Unlock flow comes next. Packs will pull from published cards + extra media.</p>
          <div className="bg-gradient-to-br from-pink-800 to-purple-900 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-2">🎴</p>
            <p className="font-bold text-lg">Starter Pack</p>
            <p className="text-xs text-pink-200/80 mt-1 mb-4">3 cards · placeholder</p>
            <button disabled className="bg-white/20 rounded-full px-6 py-2 text-sm font-semibold opacity-50">
              100 tokens
            </button>
          </div>
        </div>
      )}

      {tab === 'duel' && (
        <div className="pt-16 max-w-lg mx-auto px-4 pb-24 text-center text-gray-500 text-sm">
          Duel stacks — coming soon.
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-lg mx-auto grid grid-cols-4 text-center py-2 text-[10px] text-gray-500">
          <button onClick={() => setTab('home')} className={`py-2 ${tab === 'home' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🏠</div>Home
          </button>
          <button onClick={() => setTab('packs')} className={`py-2 ${tab === 'packs' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🎴</div>Packs
          </button>
          <button onClick={() => setTab('cards')} className={`py-2 ${tab === 'cards' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">💎</div>Cards
          </button>
          <button onClick={() => setTab('duel')} className={`py-2 ${tab === 'duel' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">⚔️</div>Duel
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
        .animate-marquee { animation: marquee 40s linear infinite; }
        .animate-marquee-slow { animation: marquee-slow 55s linear infinite; }
      `}</style>
    </div>
  )
}
