// pages/game.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Game() {
  const router = useRouter()
  const [marquee, setMarquee] = useState([])
  const [publishedCards, setPublishedCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('home') // home | packs | collection | shop | duel
  const [tokens, setTokens] = useState(0)
  // landscape banners per tab — set in Settings
  const [tabBanners, setTabBanners] = useState({})
  const [tabTitles, setTabTitles] = useState({
    home: 'Home',
    packs: 'Mystery Packs',
    shop: 'Shop',
    collection: 'My Collection',
    duel: 'Duel',
  })
  const [shopIntroUrl, setShopIntroUrl] = useState('')
  const [showShopIntro, setShowShopIntro] = useState(false)
  const shopVideoRef = useRef(null)
  const [showSplash, setShowSplash] = useState(true)
  const splashRef = useRef(null)
  const [bannerVideoDone, setBannerVideoDone] = useState({}) // tabKey -> true after intro played

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data: cards } = await supabase
      .from('cards')
      .select('id, name, card_number, image_url, back_image_url, video_url, poster_url, published, rarity')
      .eq('published', true)
      .order('created_at', { ascending: false })

    setPublishedCards(cards || [])

    let strip = []
    const { data: favs } = await supabase
      .from('gallery_media')
      .select('id, url, prompt')
      .eq('type', 'image')
      .eq('is_favorite', true)
      .order('created_at', { ascending: false })
      .limit(24)
    strip = (favs || []).map(f => ({ id: 'gal_' + f.id, url: f.url, prompt: f.prompt }))

    if (strip.length < 4) {
      const { data: recent } = await supabase
        .from('gallery_media')
        .select('id, url, prompt')
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(24)
      const extra = (recent || []).map(f => ({ id: 'gal_' + f.id, url: f.url, prompt: f.prompt }))
      const seen = new Set(strip.map(b => b.id))
      for (const e of extra) {
        if (!seen.has(e.id)) strip.push(e)
      }
      strip = strip.slice(0, 24)
    }
    setMarquee(strip)

    const { data: settings } = await supabase
      .from('user_settings')
      .select('tokens, tab_banners, tab_titles, shop_intro_url')
      .eq('id', 1)
      .maybeSingle()
    setTokens(settings?.tokens ?? 0)
    setTabBanners(settings?.tab_banners || {})
    if (settings?.tab_titles) {
      setTabTitles(prev => ({ ...prev, ...settings.tab_titles }))
    }
    setShopIntroUrl(settings?.shop_intro_url || '')

    setLoading(false)
  }

  const openTab = (next) => {
    setTab(next)
    if (next === 'shop' && shopIntroUrl) {
      setShowShopIntro(true)
    }
  }

  const closeShopIntro = () => {
    setShowShopIntro(false)
    if (shopVideoRef.current) {
      try { shopVideoRef.current.pause() } catch {}
    }
  }

  const strip = marquee.length ? [...marquee, ...marquee] : []

  const TabBanner = ({ tabKey }) => {
    const raw = tabBanners?.[tabKey]
    const image = (typeof raw === 'string' ? raw : (raw?.image || '')).trim()
    const video = (typeof raw === 'string' ? '' : (raw?.video || '')).trim()
    const showVideo = !!(video && !bannerVideoDone[tabKey])
    // nothing configured, or video finished and no static image → no gap
    if (!showVideo && !image) return null
    return (
      <div className="w-full max-w-lg mx-auto px-4 mb-4">
        <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden border border-white/10 bg-black">
          {showVideo ? (
            <video
              key={tabKey + '-vid'}
              src={video}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover object-top"
              onEnded={() => setBannerVideoDone(prev => ({ ...prev, [tabKey]: true }))}
              onError={() => setBannerVideoDone(prev => ({ ...prev, [tabKey]: true }))}
            />
          ) : (
            <img src={image} alt="" className="w-full h-full object-cover object-top" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        </div>
      </div>
    )
  }

  const TabHeader = ({ title }) => (
    <div className="flex items-center justify-between mb-3 px-4 max-w-lg mx-auto">
      <button onClick={() => setTab('home')} className="text-sm text-gray-400 hover:text-white">← Back</button>
      <h2 className="font-bold text-lg">{title}</h2>
      <button onClick={() => setTab('home')} className="text-gray-400 hover:text-white text-lg leading-none px-1">✕</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <div className="fixed top-0 inset-x-0 z-40 bg-black/70 backdrop-blur border-b border-white/10">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <button onClick={() => router.push('/settings')} className="text-xs text-gray-400 hover:text-white">
            ⚙ Mode
          </button>
          <img src="/goddess-arena-logo.png" alt="Goddess Arena" className="h-11 object-contain" />
          <button onClick={() => router.push('/gallery')} className="text-xs text-gray-400 hover:text-white">
            Studio
          </button>
        </div>
      </div>

      {tab === 'home' && (
        <>
          <div className="pt-14">
            <TabBanner tabKey="home" />
            <div className="relative h-56 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-pink-600/20 via-transparent to-black z-10 pointer-events-none" />
              {loading ? (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm">Loading...</div>
              ) : marquee.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm px-6 text-center">
                  Favorite images in Studio to fill the scroll banners.
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

          {marquee.length > 0 && (
            <div className="relative h-36 overflow-hidden mt-2 opacity-80">
              <div className="flex h-full gap-2 animate-marquee-slow" style={{ width: 'max-content' }}>
                {[...marquee].reverse().concat([...marquee].reverse()).map((b, i) => (
                  <div key={`r-${b.id}-${i}`} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg">
                    <img src={b.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-lg mx-auto px-4 mt-8 space-y-3 pb-24">
            <p className="text-[10px] tracking-[0.25em] uppercase text-gray-500 mb-1">Play</p>

            <button onClick={() => openTab('packs')} className="w-full text-left bg-gradient-to-r from-pink-700 to-purple-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{tabTitles.packs || 'Mystery Packs'}</p>
                  <p className="text-xs text-pink-200/80 mt-0.5">Spend tokens · unlock rare cards</p>
                </div>
                <span className="text-2xl">🎴</span>
              </div>
            </button>

            <button onClick={() => openTab('shop')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{tabTitles.shop || 'Shop'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Buy cards &amp; tokens</p>
                </div>
                <span className="text-2xl">🛒</span>
              </div>
            </button>

            <button onClick={() => openTab('collection')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{tabTitles.collection || 'My Collection'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Cards you own</p>
                </div>
                <span className="text-2xl">💎</span>
              </div>
            </button>

            <button onClick={() => openTab('duel')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{tabTitles.duel || 'Duel'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Coming soon</p>
                </div>
                <span className="text-2xl">⚔️</span>
              </div>
            </button>

            <div className="mt-8 rounded-2xl border border-pink-900/40 bg-pink-950/30 p-4">
              <p className="text-xs text-pink-300 font-semibold mb-1">Tokens</p>
              <p className="text-3xl font-bold">{tokens.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500 mt-1">Spend on packs · earn more later</p>
            </div>
          </div>
        </>
      )}

      {tab === 'collection' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.collection || "My Collection"} />
          <TabBanner tabKey="collection" />
          <div className="max-w-lg mx-auto px-4">
            <p className="text-xs text-gray-500 mb-4">Cards you have unlocked or bought</p>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
              <p className="text-3xl mb-2">💎</p>
              <p className="text-sm text-gray-400">Your collection is empty</p>
              <p className="text-xs text-gray-600 mt-1">Open packs or visit the Shop to get cards</p>
              <button onClick={() => openTab('shop')} className="mt-4 text-sm text-pink-400 hover:text-pink-300 font-semibold">
                Go to Shop →
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'shop' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.shop || "Shop"} />
          <TabBanner tabKey="shop" />
          <div className="max-w-lg mx-auto px-4">
            <div className="rounded-2xl border border-pink-900/40 bg-pink-950/30 p-4 mb-6">
              <p className="text-xs text-pink-300 font-semibold mb-1">Your balance</p>
              <p className="text-2xl font-bold">{tokens.toLocaleString()} tokens</p>
            </div>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">Token packs</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[
                { amount: 500, price: '$0.99' },
                { amount: 3000, price: '$4.99' },
                { amount: 10000, price: '$14.99' },
              ].map(p => (
                <button key={p.amount} disabled className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center opacity-70">
                  <p className="text-sm font-bold text-pink-300">{p.amount.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{p.price}</p>
                </button>
              ))}
            </div>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">Featured cards</p>
            {publishedCards.length === 0 ? (
              <p className="text-sm text-gray-600">No cards in the shop yet. Publish cards from Studio.</p>
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
                      <p className="text-[10px] text-gray-600 capitalize">{c.rarity || 'card'}</p>
                      <button disabled className="w-full mt-2 bg-pink-900/50 rounded-lg py-1.5 text-[10px] font-semibold text-pink-200/70">
                        Buy · soon
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'packs' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.packs || "Mystery Packs"} />
          <TabBanner tabKey="packs" />
          <div className="max-w-lg mx-auto px-4">
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
        </div>
      )}

      {tab === 'duel' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.duel || "Duel"} />
          <TabBanner tabKey="duel" />
          <div className="max-w-lg mx-auto px-4">
            <p className="text-center text-gray-500 text-sm">Duel stacks — coming soon.</p>
          </div>
        </div>
      )}

      {/* Initial load splash — animated logo */}
      {showSplash && (
        <div className="fixed inset-0 z-[90] bg-black flex items-center justify-center">
          <video
            ref={splashRef}
            src="/goddess-arena-logo.mp4"
            autoPlay
            muted
            playsInline
            className="w-full max-w-md px-6 object-contain"
            onEnded={() => setShowSplash(false)}
            onError={() => setShowSplash(false)}
          />
        </div>
      )}

      {/* Shop intro — animated video + audio, auto-closes when finished */}
      {showShopIntro && shopIntroUrl && (
        <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center">
          <button
            onClick={closeShopIntro}
            className="absolute top-4 right-4 z-10 text-white/80 hover:text-white text-2xl px-3 py-1"
          >
            ✕
          </button>
          <video
            ref={shopVideoRef}
            src={shopIntroUrl}
            autoPlay
            playsInline
            className="w-full h-full object-contain max-w-lg"
            onEnded={closeShopIntro}
            onError={closeShopIntro}
          />
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-lg mx-auto grid grid-cols-5 text-center py-2 text-[10px] text-gray-500">
          <button onClick={() => openTab('home')} className={`py-2 ${tab === 'home' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🏠</div>{(tabTitles.home || 'Home').split(' ')[0]}
          </button>
          <button onClick={() => openTab('packs')} className={`py-2 ${tab === 'packs' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🎴</div>{(tabTitles.packs || 'Packs').split(' ')[0]}
          </button>
          <button onClick={() => openTab('shop')} className={`py-2 ${tab === 'shop' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🛒</div>{(tabTitles.shop || 'Shop').split(' ')[0]}
          </button>
          <button onClick={() => openTab('collection')} className={`py-2 ${tab === 'collection' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">💎</div>{(tabTitles.collection || 'Mine').split(' ')[0]}
          </button>
          <button onClick={() => openTab('duel')} className={`py-2 ${tab === 'duel' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">⚔️</div>{(tabTitles.duel || 'Duel').split(' ')[0]}
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
