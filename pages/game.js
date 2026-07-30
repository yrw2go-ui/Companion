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
  const [ownedCards, setOwnedCards] = useState([]) // player_cards joined with card data
  const [buying, setBuying] = useState(false)
  const [reveal, setReveal] = useState(null) // { card, instanceId, price, phase: 'anim'|'show' }
  const revealVideoRef = useRef(null)

  // --- tweakable mystery draw weights (must sum conceptually; normalized at roll) ---
  const TIER_WEIGHTS = {
    low: { // 200 tok
      common: 70, uncommon: 20, rare: 8, epic: 1.5, legendary: 0.4, 'ultra elite': 0.1, 'after hours': 0.5,
    },
    mid: { // 500 tok
      common: 40, uncommon: 30, rare: 20, epic: 7, legendary: 2.5, 'ultra elite': 0.5, 'after hours': 1,
    },
    high: { // 800 tok
      common: 15, uncommon: 25, rare: 30, epic: 18, legendary: 8, 'ultra elite': 2.5, 'after hours': 1.5,
    },
  }
  const TIER_PRICE = { low: 200, mid: 500, high: 800 }
  const MEDIA_SINGLE_PRICE = 400
  const MEDIA_MULTI_PRICE = 1100
  const MEDIA_MULTI_QTY = 3
  const MEDIA_VIDEO_CHANCE = 0.18
  const BUCKS = 'BabeBucks'

  // Real-money token packs (display only until payments wired)
  const TOKEN_PACKS = [
    { amount: 500, price: '$1.99' },
    { amount: 1500, price: '$4.99' },
    { amount: 4000, price: '$9.99' },
    { amount: 10000, price: '$19.99' },
  ]

  // P2P sale floor / ceiling. Each completed sale +25 until max.
  // [nonSeriesBase, nonSeriesMax, seriesBase, seriesMax]
  const CARD_SALE_TABLE = {
    common:        [100, 200, 150, 250],
    uncommon:      [200, 200, 250, 300],
    rare:          [350, 500, 400, 600],
    epic:          [500, 800, 600, 1000],
    legendary:     [750, 1200, 900, 1500],
    'ultra elite': [900, 1600, 1200, 2000],
    'after hours': [1000, 2000, 2000, 3000],
  }
  const MEDIA_SALE_BASE = 400
  const MEDIA_SALE_MAX = 800
  const MEDIA_SALE_STEP = 50  // only when edition_total < 100
  const CARD_SALE_STEP = 25

  const cardSaleBounds = (rarity, isSeries) => {
    const row = CARD_SALE_TABLE[String(rarity || 'common').toLowerCase()] || CARD_SALE_TABLE.common
    return isSeries ? { base: row[2], max: row[3] } : { base: row[0], max: row[1] }
  }
  const currentSalePrice = (base, max, saleCount, step = CARD_SALE_STEP) =>
    Math.min(max, base + (saleCount || 0) * step)

  // Mystery skins: public/mystery-card-1.jpg + .mp4 … through N
  const MYSTERY_SKIN_COUNT = 5
  const MYSTERY_SKINS = Array.from({ length: MYSTERY_SKIN_COUNT }, (_, i) => ({
    image: `/mystery-card-${i + 1}.jpg`,
    video: `/mystery-card-${i + 1}.mp4`,
  }))
  const randomSkin = () => MYSTERY_SKINS[Math.floor(Math.random() * MYSTERY_SKINS.length)]

  const weightedPick = (weights) => {
    const entries = Object.entries(weights)
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = Math.random() * total
    for (const [key, w] of entries) {
      r -= w
      if (r <= 0) return key
    }
    return entries[entries.length - 1][0]
  }

  const mediaTrim = (editionTotal, editionNumber) => {
    // ≤50 → iridescent, ≤100 → gold, >100 → no special trim
    if (editionTotal <= 50) return { label: 'iridescent', className: 'ring-2 ring-cyan-300/80 shadow-[0_0_12px_rgba(103,232,249,0.5)]' }
    if (editionTotal <= 100) return { label: 'gold', className: 'ring-2 ring-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.45)]' }
    return { label: null, className: '' }
  }

  const makeInstanceId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = 'GA-'
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  useEffect(() => {
    load()
  }, [])

  // Force splash video to play; keep splash up at least ~2.5s even if autoplay flakes
  useEffect(() => {
    if (!showSplash) return
    const minMs = 2500
    const started = Date.now()
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      setShowSplash(false)
    }
    const tryPlay = () => {
      const v = splashRef.current
      if (!v) return
      v.muted = true
      v.playsInline = true
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // autoplay blocked — show for min time then close
          const left = minMs - (Date.now() - started)
          setTimeout(close, Math.max(0, left))
        })
      }
    }
    // slight delay so video element is mounted
    const t = setTimeout(tryPlay, 50)
    const safety = setTimeout(close, 12000) // never hang forever
    return () => {
      clearTimeout(t)
      clearTimeout(safety)
    }
  }, [showSplash])

  const load = async () => {
    const { data: cards } = await supabase
      .from('cards')
      .select('id, name, card_number, image_url, back_image_url, video_url, poster_url, published, rarity, edition_size, series_name, title')
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

    // owned card instances (Harem)
    const { data: owned } = await supabase
      .from('player_cards')
      .select('id, instance_id, card_id, purchase_price, acquired_via, edition_number, edition_total, sale_count, current_sale_price, created_at, cards(id, name, card_number, image_url, back_image_url, video_url, poster_url, rarity, title, series_name, edition_size)')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedCards(owned || [])

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

  const nextEditionNumber = async (cardId) => {
    const { count } = await supabase
      .from('player_cards')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', cardId)
    return (count || 0) + 1
  }

  const cardsWithStock = async () => {
    // published cards that still have remaining print run
    const cards = publishedCards.length
      ? publishedCards
      : (await supabase.from('cards').select('id, name, card_number, image_url, back_image_url, video_url, poster_url, published, rarity, edition_size, series_name, title').eq('published', true)).data || []

    const result = []
    for (const c of cards) {
      const total = c.edition_size || 500
      const { count } = await supabase
        .from('player_cards')
        .select('id', { count: 'exact', head: true })
        .eq('card_id', c.id)
      const sold = count || 0
      if (sold < total) result.push({ ...c, _sold: sold, _total: total })
    }
    return result
  }

  const drawOneCard = async (tier, unitPrice) => {
    const stock = await cardsWithStock()
    if (!stock.length) return { error: 'Shop is sold out — no edition stock left.' }

    const weights = { ...TIER_WEIGHTS[tier] }
    for (const r of Object.keys(weights)) {
      if (!stock.some(c => String(c.rarity || 'common').toLowerCase() === r)) weights[r] = 0
    }
    if (Object.values(weights).every(w => w <= 0)) {
      for (const r of Object.keys(weights)) weights[r] = 1
    }

    const pickedRarity = weightedPick(weights)
    let pool = stock.filter(c => String(c.rarity || 'common').toLowerCase() === pickedRarity)
    if (!pool.length) pool = stock
    const card = pool[Math.floor(Math.random() * pool.length)]
    // re-count sold for accuracy
    const { count } = await supabase
      .from('player_cards')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', card.id)
    const editionNumber = (count || 0) + 1
    const editionTotal = card.edition_size || 500
    if (editionNumber > editionTotal) return { error: 'That card just sold out.' }

    const instanceId = makeInstanceId()
    const bounds = cardSaleBounds(card.rarity, !!card.series_name)
    const { data: row, error } = await supabase
      .from('player_cards')
      .insert([{
        instance_id: instanceId,
        card_id: card.id,
        owner_id: 1,
        purchase_price: unitPrice,
        acquired_via: 'shop',
        edition_number: editionNumber,
        edition_total: editionTotal,
        sale_count: 0,
        current_sale_price: bounds.base,
      }])
      .select('id, instance_id, card_id, purchase_price, acquired_via, edition_number, edition_total, sale_count, current_sale_price, created_at')
      .single()
    if (error) return { error: error.message }
    return { row, card, instanceId, editionNumber, editionTotal }
  }

  const buyMysteryTier = async (tier, packSize = 1) => {
    if (buying || reveal) return
    const unit = TIER_PRICE[tier]
    const price = unit * packSize
    if (tokens < price) {
      alert(`Need ${price.toLocaleString()} ${BUCKS} (you have ${tokens.toLocaleString()})`)
      return
    }
    const label = packSize > 1 ? `${packSize}× ${tier} draws` : `${tier} mystery draw`
    if (!confirm(`Open ${label} for ${price.toLocaleString()} ${BUCKS}?`)) return

    setBuying(true)
    try {
      const newBalance = tokens - price
      const { error: tokErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tokErr) throw new Error(tokErr.message)

      const won = []
      for (let i = 0; i < packSize; i++) {
        const result = await drawOneCard(tier, unit)
        if (result.error) {
          // stop early but keep what we got; refund remainder roughly
          if (!won.length) {
            await supabase.from('user_settings').upsert({ id: 1, tokens })
            throw new Error(result.error)
          }
          break
        }
        won.push(result)
      }

      setTokens(newBalance)
      setOwnedCards(prev => [
        ...won.map(w => ({ ...w.row, cards: w.card })),
        ...prev,
      ])

      const last = won[won.length - 1]
      const skin = randomSkin()
      setReveal({
        card: last.card,
        instanceId: last.instanceId,
        price: unit,
        phase: 'anim',
        video: skin.video,
        editionNumber: last.editionNumber,
        editionTotal: last.editionTotal,
        packWon: won.length,
        packSize,
      })
    } catch (err) {
      alert('Purchase failed: ' + err.message)
    }
    setBuying(false)
  }

  const drawOneMedia = async (unitPrice) => {
    const wantVideo = Math.random() < MEDIA_VIDEO_CHANCE
    let { data: mediaList } = await supabase
      .from('character_media')
      .select('*')
      .eq('published', true)
      .eq('type', wantVideo ? 'video' : 'image')
    if (!mediaList?.length) {
      const alt = await supabase.from('character_media').select('*').eq('published', true)
      mediaList = alt.data || []
    }
    if (!mediaList.length) return { error: 'No published character media available yet.' }

    const available = []
    for (const m of mediaList) {
      const total = m.edition_size || 100
      const { count } = await supabase
        .from('player_media')
        .select('id', { count: 'exact', head: true })
        .eq('media_id', m.id)
      if ((count || 0) < total) available.push({ ...m, _sold: count || 0, _total: total })
    }
    if (!available.length) return { error: 'All media editions are sold out.' }

    const m = available[Math.floor(Math.random() * available.length)]
    const { count } = await supabase
      .from('player_media')
      .select('id', { count: 'exact', head: true })
      .eq('media_id', m.id)
    const editionNumber = (count || 0) + 1
    const editionTotal = m.edition_size || 100
    const instanceId = makeInstanceId()
    const trim = mediaTrim(editionTotal, editionNumber)

    const { data: row, error } = await supabase
      .from('player_media')
      .insert([{
        instance_id: instanceId,
        media_id: m.id,
        owner_id: 1,
        purchase_price: unitPrice,
        edition_number: editionNumber,
        edition_total: editionTotal,
        acquired_via: 'shop',
        sale_count: 0,
        current_sale_price: MEDIA_SALE_BASE,
      }])
      .select('*')
      .single()
    if (error) return { error: error.message }
    return { row, media: m, instanceId, editionNumber, editionTotal, trim }
  }

  const buyMedia = async (qty = 1) => {
    if (buying || reveal) return
    const price = qty >= MEDIA_MULTI_QTY ? MEDIA_MULTI_PRICE : MEDIA_SINGLE_PRICE * qty
    const unit = Math.floor(price / qty)
    if (tokens < price) {
      alert('Need ' + price.toLocaleString() + ' ' + BUCKS)
      return
    }
    if (!confirm('Get ' + qty + ' random media for ' + price.toLocaleString() + ' ' + BUCKS + '?')) return
    setBuying(true)
    try {
      const newBalance = tokens - price
      const { error: tokErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tokErr) throw new Error(tokErr.message)

      const won = []
      for (let i = 0; i < qty; i++) {
        const result = await drawOneMedia(unit)
        if (result.error) {
          if (!won.length) {
            await supabase.from('user_settings').upsert({ id: 1, tokens })
            throw new Error(result.error)
          }
          break
        }
        won.push(result)
      }

      setTokens(newBalance)
      const last = won[won.length - 1]
      const skin = randomSkin()
      setReveal({
        phase: 'anim',
        kind: 'media',
        media: last.media,
        instanceId: last.instanceId,
        price: unit,
        editionNumber: last.editionNumber,
        editionTotal: last.editionTotal,
        trim: last.trim,
        video: skin.video,
        packWon: won.length,
        packSize: qty,
      })
    } catch (err) {
      alert('Media buy failed: ' + err.message)
    }
    setBuying(false)
  }

  const finishReveal = () => {
    setReveal(prev => prev ? { ...prev, phase: 'show' } : null)
  }

  const closeReveal = () => setReveal(null)

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
                  <p className="text-xs text-pink-200/80 mt-0.5">Spend BabeBucks · unlock rare cards</p>
                </div>
                <span className="text-2xl">🎴</span>
              </div>
            </button>

            <button onClick={() => openTab('shop')} className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{tabTitles.shop || 'Shop'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Buy cards &amp; BabeBucks</p>
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
              <p className="text-xs text-pink-300 font-semibold mb-1">BabeBucks</p>
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
            <p className="text-xs text-gray-500 mb-4">
              Your Harem · {ownedCards.length} card{ownedCards.length === 1 ? '' : 's'}
            </p>
            {ownedCards.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
                <p className="text-3xl mb-2">💎</p>
                <p className="text-sm text-gray-400">Your collection is empty</p>
                <p className="text-xs text-gray-600 mt-1">Buy mystery cards in the Shop</p>
                <button onClick={() => openTab('shop')} className="mt-4 text-sm text-pink-400 hover:text-pink-300 font-semibold">
                  Go to Shop →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {ownedCards.map(o => {
                  const c = o.cards || {}
                  return (
                    <div key={o.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.name || ''} className="w-full aspect-[3/4] object-cover object-top" />
                      ) : (
                        <div className="w-full aspect-[3/4] bg-gray-800" />
                      )}
                      <div className="p-2">
                        <p className="text-xs font-semibold truncate">{c.name || 'Card'}{c.series_name ? ' 👑' : ''}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{c.rarity || '—'}</p>
                        {o.edition_number && o.edition_total ? (
                          <p className="text-[10px] text-amber-300/90 mt-0.5">
                            {o.edition_number} of {o.edition_total}
                          </p>
                        ) : null}
                        <p className="text-[9px] text-pink-400/80 font-mono mt-1">{o.instance_id}</p>
                        <p className="text-[9px] text-gray-600">Paid {Number(o.purchase_price || 0).toLocaleString()} tok</p>
                        {(() => {
                          const bounds = cardSaleBounds(c.rarity, !!c.series_name)
                          const saleCount = o.sale_count || 0
                          const cur = o.current_sale_price != null
                            ? o.current_sale_price
                            : currentSalePrice(bounds.base, bounds.max, saleCount)
                          return (
                            <p className="text-[9px] text-emerald-400/90 mt-0.5">
                              Trade value {cur} · max {bounds.max}
                            </p>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
              <p className="text-2xl font-bold">{tokens.toLocaleString()} BabeBucks</p>
            </div>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">BabeBucks packs</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {TOKEN_PACKS.map(tp => (
                <button key={tp.amount} disabled className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center opacity-70">
                  <p className="text-sm font-bold text-pink-300">{tp.amount.toLocaleString()} BB</p>
                  <p className="text-[11px] text-gray-400 mt-1">{tp.price}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mb-6 -mt-3">Payments not wired yet — prices shown for store layout.</p>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">Mystery card draws</p>
            <p className="text-[10px] text-gray-600 mb-3">
              Rarity stays hidden until reveal. Higher tiers weight toward rarer cards. Each copy is numbered (e.g. 12 of 500).
            </p>
            <div className="space-y-3 mb-8">
              {[
                { tier: 'low', title: 'Shadow Draw', blurb: 'Mostly commons · slim rare chance', img: '/mystery-card-1.jpg' },
                { tier: 'mid', title: 'Velvet Draw', blurb: 'Balanced mix · better rare odds', img: '/mystery-card-2.jpg' },
                { tier: 'high', title: 'Crown Draw', blurb: 'Best shot at epic+ & series cards', img: '/mystery-card-3.jpg' },
              ].map(t => (
                <div key={t.tier} className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
                  <div className="flex gap-3 items-center mb-2">
                    <img src={t.img} alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{t.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{t.blurb}</p>
                      <p className="text-pink-400 text-xs font-semibold mt-1">{TIER_PRICE[t.tier]} BB each</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => buyMysteryTier(t.tier, n)}
                        disabled={buying}
                        className="bg-pink-600/90 hover:bg-pink-500 disabled:opacity-40 rounded-lg py-2 text-[10px] font-semibold"
                      >
                        {n === 1 ? '×1' : `×${n}`}
                        <span className="block text-[9px] font-normal opacity-80">
                          {(TIER_PRICE[t.tier] * n).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mb-6 -mt-4">
              No specific cards for sale in the shop — only mystery draws. Specific copies trade between players.
            </p>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">Card Character Media</p>
            <p className="text-[10px] text-gray-600 mb-3">
              Random published extra media. Videos are rarer. Low print runs get gold or iridescent trim.
            </p>
            <div className="space-y-2 mb-4">
              <button
                onClick={() => buyMedia(1)}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src="/mystery-card-4.jpg" alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Random Media · 1 qty</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Image or video · numbered edition</p>
                  <p className="text-pink-400 text-xs font-semibold mt-2">{MEDIA_SINGLE_PRICE.toLocaleString()} {BUCKS}</p>
                </div>
              </button>
              <button
                onClick={() => buyMedia(MEDIA_MULTI_QTY)}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src="/mystery-card-5.jpg" alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Media Multi · 3 qty</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Three random drops · better rate</p>
                  <p className="text-pink-400 text-xs font-semibold mt-2">{MEDIA_MULTI_PRICE.toLocaleString()} {BUCKS}</p>
                </div>
              </button>
            </div>
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
                100 BabeBucks
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

      {/* Purchase reveal: mystery animation then card face */}
      {reveal && (
        <div className="fixed inset-0 z-[85] bg-black/95 flex flex-col items-center justify-center p-5">
          {reveal.phase === 'anim' ? (
            <>
              <video
                ref={revealVideoRef}
                src={reveal.video || '/mystery-card-1.mp4'}
                autoPlay
                playsInline
                className="w-full max-w-sm rounded-2xl"
                onEnded={finishReveal}
                onError={finishReveal}
              />
              <p className="text-xs text-gray-500 mt-4">Revealing...</p>
              <button onClick={finishReveal} className="mt-3 text-xs text-gray-400 hover:text-white">Skip</button>
            </>
          ) : reveal.kind === 'media' ? (
            <div className="w-full max-w-sm">
              <div className={`rounded-2xl overflow-hidden ${reveal.trim?.className || ''}`}>
                {reveal.media?.type === 'video' ? (
                  <video src={reveal.media.url} controls className="w-full" />
                ) : (
                  <img src={reveal.media?.url} alt="" className="w-full" />
                )}
              </div>
              <div className="mt-4 text-center">
                <p className="text-lg font-bold">{reveal.media?.title || 'Character media'}</p>
                <p className="text-xs text-gray-400 mt-1 capitalize">{reveal.media?.type}</p>
                {reveal.editionNumber && (
                  <p className="text-sm text-amber-300 mt-2">
                    {reveal.editionNumber} of {reveal.editionTotal}
                    {reveal.trim?.label ? ` · ${reveal.trim.label} trim` : ''}
                  </p>
                )}
                <p className="text-[11px] text-pink-400 font-mono mt-2">{reveal.instanceId}</p>
              </div>
              <button onClick={closeReveal} className="w-full mt-5 bg-pink-600 hover:bg-pink-500 rounded-xl py-3 font-semibold">
                Keep
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <img
                src={reveal.card.image_url}
                alt={reveal.card.name || ''}
                className="w-full rounded-2xl border border-pink-900/50"
              />
              <div className="mt-4 text-center">
                <p className="text-lg font-bold">
                  {reveal.card.name}{reveal.card.series_name ? ' 👑' : ''}
                </p>
                {reveal.card.series_name && (
                  <p className="text-[10px] text-gray-400 tracking-widest uppercase mt-1">{reveal.card.series_name}</p>
                )}
                <p className="text-xs text-gray-400 capitalize mt-1">{reveal.card.rarity}</p>
                {reveal.editionNumber && (
                  <p className="text-sm text-amber-300 mt-2">
                    {reveal.editionNumber} of {reveal.editionTotal}
                  </p>
                )}
                <p className="text-[11px] text-pink-400 font-mono mt-2">{reveal.instanceId}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  Acquired for {Number(reveal.price || 0).toLocaleString()} BabeBucks
                </p>
                {reveal.packSize > 1 && (
                  <p className="text-[10px] text-pink-300 mt-2">
                    Pack: {reveal.packWon}/{reveal.packSize} cards added to Harem
                  </p>
                )}
              </div>
              <button
                onClick={() => { closeReveal(); openTab('collection') }}
                className="w-full mt-5 bg-pink-600 hover:bg-pink-500 rounded-xl py-3 font-semibold"
              >
                Add to Harem
              </button>
              <button onClick={closeReveal} className="w-full mt-2 text-sm text-gray-400 hover:text-white py-2">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* Initial load splash — animated logo */}
      {showSplash && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          <video
            ref={splashRef}
            src="/goddess-arena-logo.mp4"
            poster="/goddess-arena-logo.png"
            autoPlay
            muted
            playsInline
            preload="auto"
            className="w-full max-w-md px-6 object-contain"
            onEnded={() => setShowSplash(false)}
            onError={() => {
              // fall back: keep static logo briefly then dismiss
              setTimeout(() => setShowSplash(false), 2000)
            }}
          />
          <button
            type="button"
            onClick={() => setShowSplash(false)}
            className="mt-6 text-xs text-gray-500 hover:text-white"
          >
            Skip
          </button>
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
