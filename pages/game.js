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
  const [ownedMedia, setOwnedMedia] = useState([]) // player_media joined with character_media
  const [ownedMisc, setOwnedMisc] = useState([])
  const [viewOwned, setViewOwned] = useState(null) // { kind, row, stack: [] }
  const [ownedSide, setOwnedSide] = useState('front') // card front/back
  const [stackIndex, setStackIndex] = useState(0)
  const [mediaFullscreen, setMediaFullscreen] = useState(false)
  const [playOwnedVideo, setPlayOwnedVideo] = useState(false)
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
  const MISC_SINGLE_PRICE = 200
  const MISC_SET_PRICE = 700
  const VIDEO_UNLOCK_PRICE = 100
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

    // Scrolling home banner: images filed in Gallery folder "Main Banner"
    // Prefer thumbnail_url to cut egress; no hard low cap — use everything in the folder
    const mapBanner = (f) => ({
      id: 'gal_' + f.id,
      url: f.thumbnail_url || f.url,
      prompt: f.prompt,
    })
    let strip = []
    const { data: folderRows } = await supabase.from('gallery_folders').select('id, name')
    const mainFolder = (folderRows || []).find(f => String(f.name || '').trim().toLowerCase() === 'main banner')
    if (mainFolder) {
      const { data: fis } = await supabase
        .from('folder_items')
        .select('item_key')
        .eq('folder_id', mainFolder.id)
      const ids = (fis || []).map(x => {
        const k = String(x.item_key || '')
        if (k.startsWith('gal_')) return k.slice(4)
        // raw uuid
        if (/^[0-9a-f-]{36}$/i.test(k)) return k
        return null
      }).filter(Boolean)
      if (ids.length) {
        // chunk in() in case of large folders
        const media = []
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100)
          const { data } = await supabase
            .from('gallery_media')
            .select('id, url, thumbnail_url, prompt, type')
            .in('id', chunk)
            .eq('type', 'image')
          if (data) media.push(...data)
        }
        strip = media.map(mapBanner)
      }
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
      .select('id, instance_id, card_id, purchase_price, acquired_via, edition_number, edition_total, sale_count, current_sale_price, video_unlocked, created_at, cards(id, name, card_number, image_url, back_image_url, video_url, poster_url, rarity, title, series_name, edition_size, description, flavor_text, stats)')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedCards(owned || [])

    const { data: ownedM } = await supabase
      .from('player_media')
      .select('id, instance_id, media_id, purchase_price, edition_number, edition_total, sale_count, current_sale_price, acquired_via, created_at, character_media(id, character_name, type, url, title, edition_size)')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedMedia(ownedM || [])

    const { data: ownedX } = await supabase
      .from('player_misc')
      .select('id, instance_id, misc_item_id, purchase_price, acquired_via, created_at, misc_items(id, type, url, title, public_id, sort_index, set_id, misc_sets(id, name, code_prefix))')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedMisc(ownedX || [])

    setLoading(false)
  }


  const stackCards = (() => {
    const map = {}
    for (const o of ownedCards) {
      const key = o.card_id || o.cards?.id || o.id
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    return Object.values(map).map(rows => ({
      kind: 'card', rows, top: rows[0], count: rows.length, card: rows[0].cards || {},
    }))
  })()

  const stackMedia = (() => {
    const map = {}
    for (const o of ownedMedia) {
      const key = o.media_id || o.character_media?.id || o.id
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    return Object.values(map).map(rows => ({
      kind: 'media', rows, top: rows[0], count: rows.length, media: rows[0].character_media || {},
    }))
  })()

  const stackMisc = (() => {
    const map = {}
    for (const o of ownedMisc) {
      const key = o.misc_item_id || o.misc_items?.id || o.id
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    return Object.values(map).map(rows => ({
      kind: 'misc', rows, top: rows[0], count: rows.length, misc: rows[0].misc_items || {},
    }))
  })()

  const openStack = (stack) => {
    setStackIndex(0)
    setOwnedSide('front')
    setMediaFullscreen(false)
    setPlayOwnedVideo(false)
    setViewOwned({ kind: stack.kind, row: stack.rows[0], stack: stack.rows })
  }

  const stepStack = (dir) => {
    setViewOwned(prev => {
      if (!prev?.stack?.length) return prev
      const n = prev.stack.length
      const next = (stackIndex + dir + n) % n
      setStackIndex(next)
      setOwnedSide('front')
      return { ...prev, row: prev.stack[next] }
    })
  }

  const unlockCardVideo = async () => {
    if (!viewOwned || viewOwned.kind !== 'card') return
    const o = viewOwned.row
    if (o.video_unlocked) return
    const c = o.cards || {}
    if (!c.video_url) return
    if (tokens < VIDEO_UNLOCK_PRICE) {
      alert(`Need ${VIDEO_UNLOCK_PRICE} BabeBucks (you have ${tokens})`)
      return
    }
    if (!confirm(`Unlock animation for ${VIDEO_UNLOCK_PRICE} BabeBucks?`)) return
    const newBalance = tokens - VIDEO_UNLOCK_PRICE
    const { error: tErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
    if (tErr) { alert(tErr.message); return }
    const { error } = await supabase.from('player_cards').update({ video_unlocked: true }).eq('id', o.id)
    if (error) {
      await supabase.from('user_settings').upsert({ id: 1, tokens })
      alert(error.message)
      return
    }
    setTokens(newBalance)
    const patch = { video_unlocked: true }
    setOwnedCards(prev => prev.map(row => row.id === o.id ? { ...row, ...patch } : row))
    setViewOwned(prev => {
      if (!prev) return prev
      const stack = (prev.stack || []).map(row => row.id === o.id ? { ...row, ...patch } : row)
      const row = prev.row?.id === o.id ? { ...prev.row, ...patch } : prev.row
      return { ...prev, row, stack }
    })
    setPlayOwnedVideo(true)
  }

  const downloadOwnedMedia = async (url, nameHint) => {
    if (!url) return
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const ext = (blob.type || '').includes('video') ? 'mp4' : (blob.type || '').includes('png') ? 'png' : 'jpg'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(nameHint || 'media').replace(/[^\w.-]+/g, '_')}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch {
      window.open(url, '_blank')
    }
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
    // Always refresh published cards from DB so the pool is full & current
    const { data: cards } = await supabase
      .from('cards')
      .select('id, name, card_number, image_url, back_image_url, video_url, poster_url, published, rarity, edition_size, series_name, title, description, flavor_text, stats')
      .eq('published', true)

    const result = []
    for (const c of cards || []) {
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

  // Weight each individual card by its rarity odds for this tier (not pick rarity then only one card)
  const pickCardWeighted = (stock, tier) => {
    const tierW = TIER_WEIGHTS[tier] || TIER_WEIGHTS.low
    const entries = stock.map(c => {
      const r = String(c.rarity || 'common').toLowerCase()
      let w = Number(tierW[r])
      if (!w || w <= 0) w = 0.5 // still allow unknown rarities a tiny chance
      // slight boost when more print run remains so sold-out-ish cards are less likely
      const remain = Math.max(1, (c._total || 500) - (c._sold || 0))
      w *= Math.log10(9 + remain)
      return { card: c, weight: w }
    }).filter(e => e.weight > 0)

    if (!entries.length) return stock[Math.floor(Math.random() * stock.length)]

    const total = entries.reduce((s, e) => s + e.weight, 0)
    let r = Math.random() * total
    for (const e of entries) {
      r -= e.weight
      if (r <= 0) return e.card
    }
    return entries[entries.length - 1].card
  }

  const drawOneCard = async (tier, unitPrice) => {
    const stock = await cardsWithStock()
    if (!stock.length) return { error: 'Shop is sold out — no edition stock left. Publish more cards in Studio.' }
    if (stock.length === 1) {
      // only one published card with stock — will always be that character
      console.warn('Mystery draw pool size 1:', stock[0].name)
    }

    const card = pickCardWeighted(stock, tier)

    const { count } = await supabase
      .from('player_cards')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', card.id)
    const editionNumber = (count || 0) + 1
    const editionTotal = card.edition_size || 500
    if (editionNumber > editionTotal) return { error: 'That card just sold out. Try again.' }

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


  const buyMiscRandom = async () => {
    if (buying || reveal) return
    const price = MISC_SINGLE_PRICE
    if (tokens < price) {
      alert(`Need ${price} ${BUCKS}`)
      return
    }
    if (!confirm(`Random Misc Beauty for ${price} ${BUCKS}?`)) return
    setBuying(true)
    try {
      const { data: items } = await supabase.from('misc_items').select('*, misc_sets(id, name, code_prefix)').eq('published', true)
      if (!items?.length) throw new Error('No Misc Beauties published yet')
      const item = items[Math.floor(Math.random() * items.length)]
      const instanceId = makeInstanceId()
      const newBalance = tokens - price
      const { error: tErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tErr) throw new Error(tErr.message)
      const { data: row, error } = await supabase.from('player_misc').insert([{
        instance_id: instanceId,
        misc_item_id: item.id,
        owner_id: 1,
        purchase_price: price,
        acquired_via: 'shop',
      }]).select('id, instance_id, misc_item_id, purchase_price, acquired_via, created_at').single()
      if (error) {
        await supabase.from('user_settings').upsert({ id: 1, tokens })
        throw new Error(error.message)
      }
      setTokens(newBalance)
      setOwnedMisc(prev => [{ ...row, misc_items: item }, ...prev])
      setReveal({
        phase: 'show',
        kind: 'misc',
        miscItem: item,
        instanceId,
        price,
        packItems: null,
      })
    } catch (err) {
      alert('Misc buy failed: ' + err.message)
    }
    setBuying(false)
  }

  const buyMiscSet = async () => {
    if (buying || reveal) return
    const price = MISC_SET_PRICE
    if (tokens < price) {
      alert(`Need ${price} ${BUCKS}`)
      return
    }
    if (!confirm(`Random Misc set for ${price} ${BUCKS}? (all items in that set)`)) return
    setBuying(true)
    try {
      const { data: sets } = await supabase.from('misc_sets').select('id, name, code_prefix')
      if (!sets?.length) throw new Error('No sets yet')
      // only sets that have published items
      const eligible = []
      for (const s of sets) {
        const { data: items } = await supabase
          .from('misc_items')
          .select('*, misc_sets(id, name, code_prefix)')
          .eq('set_id', s.id)
          .eq('published', true)
          .order('sort_index')
        if (items?.length) eligible.push({ set: s, items })
      }
      if (!eligible.length) throw new Error('No published sets with items')
      const pick = eligible[Math.floor(Math.random() * eligible.length)]
      const instanceIdBase = makeInstanceId()
      const newBalance = tokens - price
      const { error: tErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tErr) throw new Error(tErr.message)

      const won = []
      for (let i = 0; i < pick.items.length; i++) {
        const item = pick.items[i]
        const instanceId = `${instanceIdBase}-${i + 1}`
        const { data: row, error } = await supabase.from('player_misc').insert([{
          instance_id: instanceId,
          misc_item_id: item.id,
          owner_id: 1,
          purchase_price: Math.floor(price / pick.items.length),
          acquired_via: 'shop_set',
        }]).select('id, instance_id, misc_item_id, purchase_price, acquired_via, created_at').single()
        if (error) {
          console.error(error)
          continue
        }
        won.push({ row, item })
      }
      if (!won.length) {
        await supabase.from('user_settings').upsert({ id: 1, tokens })
        throw new Error('Could not grant set items')
      }
      setTokens(newBalance)
      setOwnedMisc(prev => [
        ...won.map(w => ({ ...w.row, misc_items: w.item })),
        ...prev,
      ])
      const packItems = won.map(w => ({
        kind: 'misc',
        miscItem: w.item,
        instanceId: w.row.instance_id,
        price: w.row.purchase_price,
      }))
      setReveal({
        phase: 'show',
        kind: 'misc',
        miscItem: won[0].item,
        instanceId: won[0].row.instance_id,
        price,
        packItems,
        packIndex: 0,
        setName: pick.set.name,
      })
    } catch (err) {
      alert('Set buy failed: ' + err.message)
    }
    setBuying(false)
  }

  const buyMedia = async (qty = 1, skinOverride = null) => {
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
      setOwnedMedia(prev => [
        ...won.map(w => ({
          ...w.row,
          character_media: w.media,
        })),
        ...prev,
      ])
      const last = won[won.length - 1]
      // Match the shop tile animation (or random if not passed)
      const skin = skinOverride || randomSkin()
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
    setReveal(prev => {
      if (!prev) return null
      const items = prev.packItems || []
      if (items.length > 1) {
        const first = items[0]
        return {
          ...prev,
          phase: 'show',
          packIndex: 0,
          ...(first.kind === 'media'
            ? { kind: 'media', media: first.media, instanceId: first.instanceId, editionNumber: first.editionNumber, editionTotal: first.editionTotal, trim: first.trim }
            : { kind: 'card', card: first.card, instanceId: first.instanceId, editionNumber: first.editionNumber, editionTotal: first.editionTotal }),
        }
      }
      return { ...prev, phase: 'show' }
    })
  }

  const closeReveal = () => setReveal(null)

  const stepPackReveal = (dir) => {
    setReveal(prev => {
      if (!prev?.packItems?.length) return prev
      const n = prev.packItems.length
      const next = (prev.packIndex + dir + n) % n
      const item = prev.packItems[next]
      if (item.kind === 'media') {
        return {
          ...prev,
          packIndex: next,
          kind: 'media',
          media: item.media,
          instanceId: item.instanceId,
          editionNumber: item.editionNumber,
          editionTotal: item.editionTotal,
          trim: item.trim,
          price: item.price ?? prev.price,
        }
      }
      if (item.kind === 'misc') {
        return {
          ...prev,
          packIndex: next,
          kind: 'misc',
          miscItem: item.miscItem,
          instanceId: item.instanceId,
          price: item.price ?? prev.price,
        }
      }
      return {
        ...prev,
        packIndex: next,
        kind: 'card',
        card: item.card,
        instanceId: item.instanceId,
        editionNumber: item.editionNumber,
        editionTotal: item.editionTotal,
        price: item.price ?? prev.price,
      }
    })
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
                  Add images to the Gallery folder "Main Banner" to fill this strip.
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
              {ownedMedia.length > 0 ? ` · ${ownedMedia.length} media` : ''}
              {ownedMisc.length > 0 ? ` · ${ownedMisc.length} misc` : ''}
            </p>
            {ownedCards.length === 0 && ownedMedia.length === 0 && ownedMisc.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
                <p className="text-3xl mb-2">💎</p>
                <p className="text-sm text-gray-400">Your collection is empty</p>
                <p className="text-xs text-gray-600 mt-1">Buy mystery cards or media in the Shop</p>
                <button onClick={() => openTab('shop')} className="mt-4 text-sm text-pink-400 hover:text-pink-300 font-semibold">
                  Go to Shop →
                </button>
              </div>
            ) : (
              <>
                {stackCards.length > 0 && (
                  <>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-gray-500 mb-2">Cards</p>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {stackCards.map(st => {
                        const c = st.card
                        const o = st.top
                        return (
                          <button key={o.card_id || o.id} type="button" onClick={() => openStack(st)}
                            className="text-left relative active:scale-[0.98] transition">
                            {st.count > 1 && (
                              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-gray-800 border border-gray-700" />
                            )}
                            <div className="relative z-[1] bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                              {c.image_url ? (
                                <img src={c.image_url} alt={c.name || ''} className="w-full aspect-[3/4] object-cover object-top" />
                              ) : (
                                <div className="w-full aspect-[3/4] bg-gray-800" />
                              )}
                              {st.count > 1 && (
                                <span className="absolute top-2 right-2 bg-pink-600 text-white text-[10px] font-bold rounded-full min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center shadow">×{st.count}</span>
                              )}
                              <div className="p-2">
                                <p className="text-xs font-semibold truncate">{c.name || 'Card'}{c.series_name ? ' 👑' : ''}</p>
                                <p className="text-[10px] text-gray-500 capitalize">{c.rarity || '—'}</p>
                                {st.count > 1 ? (
                                  <p className="text-[10px] text-amber-300/90 mt-0.5">{st.count} copies</p>
                                ) : o.edition_number && o.edition_total ? (
                                  <p className="text-[10px] text-amber-300/90 mt-0.5">{o.edition_number} of {o.edition_total}</p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                {stackMedia.length > 0 && (
                  <>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-gray-500 mb-2">Character media</p>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {stackMedia.map(st => {
                        const m = st.media
                        const o = st.top
                        return (
                          <button key={o.media_id || o.id} type="button" onClick={() => openStack(st)}
                            className="text-left relative active:scale-[0.98] transition">
                            {st.count > 1 && (
                              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-gray-800 border border-gray-700" />
                            )}
                            <div className="relative z-[1] bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                              <div className="relative w-full aspect-[3/4] bg-gray-800">
                                {m.type === 'video' ? (
                                  <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                                ) : m.url ? (
                                  <img src={m.url} alt="" className="w-full h-full object-cover object-top" />
                                ) : null}
                                <img src="/ga-mark.png" alt="" className="absolute top-2 right-2 h-12 w-12 object-contain drop-shadow-lg pointer-events-none z-[5]" />
                                {st.count > 1 && (
                                  <span className="absolute top-2 left-2 bg-pink-600 text-white text-[10px] font-bold rounded-full min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center shadow z-[5]">×{st.count}</span>
                                )}
                              </div>
                              <div className="p-2">
                                <p className="text-xs font-semibold truncate">{m.title || m.character_name || 'Media'}</p>
                                <p className="text-[10px] text-gray-500 capitalize">{m.type || 'media'}</p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                {stackMisc.length > 0 && (
                  <>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-gray-500 mb-2 mt-2">Misc Beauties</p>
                    <div className="grid grid-cols-2 gap-3">
                      {stackMisc.map(st => {
                        const m = st.misc
                        const o = st.top
                        const set = m.misc_sets || {}
                        const setName = set.name || 'Standalone'
                        return (
                          <button key={o.misc_item_id || o.id} type="button" onClick={() => openStack(st)}
                            className="text-left relative active:scale-[0.98] transition">
                            {st.count > 1 && (
                              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-gray-800 border border-gray-700" />
                            )}
                            <div className="relative z-[1] bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                              <div className="relative w-full aspect-[3/4] bg-gray-800">
                                {m.type === 'video' ? (
                                  <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                                ) : m.url ? (
                                  <img src={m.url} alt="" className="w-full h-full object-cover object-top" />
                                ) : null}
                                <div className="absolute top-1.5 left-1.5 right-8 z-[5] bg-black/75 rounded-md px-1.5 py-1">
                                  <p className="text-[9px] font-mono text-pink-300 leading-tight">{m.public_id}</p>
                                  <p className="text-[8px] text-gray-300 leading-tight truncate">{setName}</p>
                                </div>
                                {st.count > 1 && (
                                  <span className="absolute bottom-2 right-2 bg-pink-600 text-white text-[10px] font-bold rounded-full min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center shadow z-[5]">×{st.count}</span>
                                )}
                                <img src="/ga-mark.png" alt="" className="absolute top-2 right-2 h-10 w-10 object-contain drop-shadow-lg pointer-events-none z-[5]" />
                              </div>
                              <div className="p-2">
                                <p className="text-[9px] text-gray-500">{m.type} · {Number(o.purchase_price || 0)} BB</p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
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
                onClick={() => buyMedia(1, MYSTERY_SKINS[3])}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src={MYSTERY_SKINS[3].image} alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Random Media · 1 qty</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Image or video · numbered edition</p>
                  <p className="text-pink-400 text-xs font-semibold mt-2">{MEDIA_SINGLE_PRICE.toLocaleString()} {BUCKS}</p>
                </div>
              </button>
              <button
                onClick={() => buyMedia(MEDIA_MULTI_QTY, MYSTERY_SKINS[4])}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src={MYSTERY_SKINS[4].image} alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
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
          ) : reveal.kind === 'misc' ? (() => {
            const m = reveal.miscItem || {}
            const set = m.misc_sets || {}
            const setName = set.name || 'Standalone'
            return (
              <div className="w-full max-w-sm">
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
                  {m.type === 'video' ? (
                    <video src={m.url} controls autoPlay playsInline className="w-full max-h-[70vh]" />
                  ) : (
                    <img src={m.url} alt="" className="w-full max-h-[70vh] object-contain" />
                  )}
                  <div className="absolute top-2 left-2 bg-black/80 rounded-lg px-2 py-1.5 max-w-[75%]">
                    <p className="text-[10px] font-mono text-pink-300">{m.public_id}</p>
                    <p className="text-[9px] text-white truncate">{setName}</p>
                    {m.sort_index != null && set.name && (
                      <p className="text-[9px] text-gray-400">{m.sort_index} of set</p>
                    )}
                  </div>
                  <img src="/ga-mark.png" alt="" className="absolute top-3 right-3 h-14 w-14 object-contain drop-shadow-lg pointer-events-none" />
                </div>
                {reveal.setName && (
                  <p className="text-center text-xs text-pink-300 mt-3">Set: {reveal.setName}</p>
                )}
                {reveal.packItems?.length > 1 && (
                  <p className="text-center text-[10px] text-pink-300 mt-1">
                    Item {(reveal.packIndex ?? 0) + 1} of {reveal.packItems.length}
                  </p>
                )}
                <p className="text-center text-[11px] text-pink-400 font-mono mt-2">{reveal.instanceId}</p>
                {reveal.packItems?.length > 1 && (
                  <div className="flex gap-2 mt-4">
                    <button type="button" onClick={() => stepPackReveal(-1)} className="flex-1 bg-gray-800 rounded-xl py-3 text-sm font-semibold">← Prev</button>
                    <button type="button" onClick={() => stepPackReveal(1)} className="flex-1 bg-gray-800 rounded-xl py-3 text-sm font-semibold">Next →</button>
                  </div>
                )}
                <button onClick={() => { closeReveal(); openTab('collection') }}
                  className="w-full mt-3 bg-pink-600 hover:bg-pink-500 rounded-xl py-3 font-semibold">View Harem</button>
                <button onClick={closeReveal} className="w-full mt-2 text-sm text-gray-400 py-2">Close</button>
              </div>
            )
          })() : reveal.kind === 'media' ? (
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
              {reveal.packItems?.length > 1 && (
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => stepPackReveal(-1)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-semibold text-sm">
                    ← Prev
                  </button>
                  <button type="button" onClick={() => stepPackReveal(1)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-semibold text-sm">
                    Next →
                  </button>
                </div>
              )}
              <button
                onClick={() => { closeReveal(); openTab('collection') }}
                className="w-full mt-3 bg-pink-600 hover:bg-pink-500 rounded-xl py-3 font-semibold"
              >
                View in Harem
              </button>
              <button onClick={closeReveal} className="w-full mt-2 text-sm text-gray-400 hover:text-white py-2">
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
                {reveal.packItems?.length > 1 && (
                  <p className="text-[10px] text-pink-300 mt-2">
                    Card {(reveal.packIndex ?? 0) + 1} of {reveal.packItems.length}
                  </p>
                )}
              </div>
              {reveal.packItems?.length > 1 && (
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => stepPackReveal(-1)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-semibold text-sm">
                    ← Prev
                  </button>
                  <button type="button" onClick={() => stepPackReveal(1)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-semibold text-sm">
                    Next →
                  </button>
                </div>
              )}
              <button
                onClick={() => { closeReveal(); openTab('collection') }}
                className="w-full mt-3 bg-pink-600 hover:bg-pink-500 rounded-xl py-3 font-semibold"
              >
                View Harem
              </button>
              <button onClick={closeReveal} className="w-full mt-2 text-sm text-gray-400 hover:text-white py-2">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* Owned item detail — stacks, trade/sell, fullscreen media */}
      {viewOwned && (() => {
        const o = viewOwned.row
        const stack = viewOwned.stack || [o]
        const stackLen = stack.length
        const tradeSell = (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => alert('Trade is coming soon')}
              className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm font-semibold border border-gray-700">Trade</button>
            <button type="button" onClick={() => alert('Sell is coming soon')}
              className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm font-semibold border border-gray-700">Sell</button>
          </div>
        )
        const stackNav = stackLen > 1 ? (
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={() => stepStack(-1)} className="flex-1 bg-gray-800 rounded-lg py-2 text-sm font-semibold">←</button>
            <span className="text-[11px] text-pink-300 font-semibold whitespace-nowrap">Copy {stackIndex + 1} / {stackLen}</span>
            <button type="button" onClick={() => stepStack(1)} className="flex-1 bg-gray-800 rounded-lg py-2 text-sm font-semibold">→</button>
          </div>
        ) : null

        if (viewOwned.kind === 'card') {
          const c = o.cards || {}
          const showBack = ownedSide === 'back'
          const stats = Array.isArray(c.stats) ? c.stats : []
          return (
            <div className="fixed inset-0 z-[88] bg-black/95 flex flex-col items-center justify-center p-4 overflow-y-auto">
              <button type="button" onClick={() => setViewOwned(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl px-3 z-10">✕</button>
              <div className="w-full max-w-sm my-8">
                <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-gray-900"
                  onClick={() => setOwnedSide(s => s === 'front' ? 'back' : 'front')}>
                  {showBack ? (
                    <>
                      {c.back_image_url ? (
                        <img src={c.back_image_url} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
                      ) : <div className="absolute inset-0 bg-gray-900" />}
                      <div className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black from-40% via-black/85 to-transparent" />
                      {c.series_name && (
                        <div className="absolute top-3 inset-x-0 text-center z-[2]">
                          <span className="text-[10px] text-black font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 1px rgba(255,255,255,0.4)' }}>{c.series_name}</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 z-[3] p-4 flex flex-col justify-end">
                        {c.description && <p className="text-[11px] text-gray-200 leading-snug mb-2">{c.description}</p>}
                        {c.flavor_text && <p className="text-[10px] italic text-gray-400 mb-3 leading-snug">&quot;{c.flavor_text}&quot;</p>}
                        {stats.length > 0 && (
                          <div className="space-y-1.5 mb-2">
                            {stats.map((s, i) => (
                              <div key={i} className="flex items-center gap-2 text-[9px]">
                                <span className="w-16 text-gray-200 truncate uppercase tracking-wide">{s.label}</span>
                                <div className="flex-1 bg-white/25 rounded-full h-1">
                                  <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(100, Number(s.value) || 0)}%` }} />
                                </div>
                                <span className="w-6 text-right text-gray-100">{s.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-white/15 gap-2">
                          <span className="font-mono text-[9px] text-gray-400 tracking-widest">{c.card_number || '—'}</span>
                          {(o.edition_number && o.edition_total) ? (
                            <span className="text-[10px] text-amber-300 font-semibold tracking-wide shrink-0">{o.edition_number}/{o.edition_total}</span>
                          ) : null}
                          <span className="text-[9px] text-gray-300 tracking-widest font-semibold shrink-0">COMP-GA</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {playOwnedVideo && o.video_unlocked && c.video_url ? (
                        <video
                          src={c.video_url}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      ) : c.image_url ? (
                        <img src={c.image_url} alt={c.name || ''} className="absolute inset-0 w-full h-full object-cover object-top" />
                      ) : <div className="absolute inset-0 bg-gray-800" />}
                      {c.series_name && <span className="absolute top-3 left-3 text-lg drop-shadow z-[2]">👑</span>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 z-[5]">
                        <p className="font-bold text-[15px] leading-tight truncate pr-24">{c.name}</p>
                        {c.title && <p className="text-[10px] text-gray-300 uppercase tracking-[0.12em] mt-0.5 truncate pr-24">{c.title}</p>}
                      </div>
                      <img src="/ga-mark.png" alt="" className="absolute bottom-2 right-1.5 z-[20] h-20 w-20 object-contain drop-shadow-lg pointer-events-none" />
                    </>
                  )}
                </div>
                <p className="text-center text-[10px] text-gray-500 mt-2">Tap card to flip · {showBack ? 'back' : 'front'}</p>
                {stackNav}
                <div className="mt-3 text-center">
                  <p className="text-sm font-bold">{c.name}{c.series_name ? ' 👑' : ''}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{c.rarity}</p>
                  {o.edition_number && <p className="text-sm text-amber-300 mt-1">{o.edition_number} of {o.edition_total}</p>}
                  <p className="text-[11px] text-pink-400 font-mono mt-1">{o.instance_id}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Paid {Number(o.purchase_price || 0).toLocaleString()} BabeBucks</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => { setOwnedSide('front'); setPlayOwnedVideo(false) }} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${!showBack ? 'bg-pink-600' : 'bg-gray-800'}`}>Front</button>
                  <button type="button" onClick={() => { setOwnedSide('back'); setPlayOwnedVideo(false) }} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${showBack ? 'bg-pink-600' : 'bg-gray-800'}`}>Back</button>
                </div>
                {c.video_url && (
                  <div className="mt-3">
                    {o.video_unlocked ? (
                      <button
                        type="button"
                        onClick={() => { setOwnedSide('front'); setPlayOwnedVideo(v => !v) }}
                        className="w-full bg-purple-700 hover:bg-purple-600 rounded-xl py-3 text-sm font-semibold"
                      >
                        {playOwnedVideo ? '⏸ Show still' : '▶ Play animation'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={unlockCardVideo}
                        className="w-full bg-gray-800 border border-pink-700/60 hover:bg-gray-700 rounded-xl py-3 text-sm font-semibold"
                      >
                        🔒 Locked · {VIDEO_UNLOCK_PRICE} BB to unlock
                      </button>
                    )}
                  </div>
                )}
                {tradeSell}
                <button type="button" onClick={() => setViewOwned(null)} className="w-full mt-3 text-sm text-gray-400 hover:text-white py-2">Close</button>
              </div>
            </div>
          )
        }

        const m = viewOwned.kind === 'misc' ? (o.misc_items || {}) : (o.character_media || {})
        const set = m.misc_sets || {}
        const title = viewOwned.kind === 'misc' ? (m.public_id || set.name || 'Misc') : (m.title || m.character_name || 'Media')
        const mediaUrl = m.url

        if (mediaFullscreen && mediaUrl) {
          return (
            <div className="fixed inset-0 z-[95] bg-black flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 z-10">
                <button type="button" onClick={() => downloadOwnedMedia(mediaUrl, title)}
                  className="text-sm font-semibold text-pink-300 hover:text-pink-200 px-3 py-1.5 rounded-lg bg-white/10">⬇ Download</button>
                <button type="button" onClick={() => setMediaFullscreen(false)} className="text-white text-2xl px-3 leading-none">✕</button>
              </div>
              <div className="flex-1 flex items-center justify-center min-h-0 px-2 pb-6">
                {m.type === 'video' ? (
                  <video src={mediaUrl} controls autoPlay playsInline className="max-w-full max-h-full object-contain" />
                ) : (
                  <img src={mediaUrl} alt="" className="max-w-full max-h-full object-contain" />
                )}
              </div>
            </div>
          )
        }

        return (
          <div className="fixed inset-0 z-[88] bg-black/95 flex flex-col items-center justify-center p-4 overflow-y-auto">
            <button type="button" onClick={() => setViewOwned(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl px-3 z-10">✕</button>
            <div className="w-full max-w-sm my-8">
              <button type="button" onClick={() => setMediaFullscreen(true)}
                className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black block">
                {m.type === 'video' ? (
                  <video src={mediaUrl} className="w-full max-h-[55vh] object-contain" muted playsInline />
                ) : (
                  <img src={mediaUrl} alt="" className="w-full max-h-[55vh] object-contain" />
                )}
                {viewOwned.kind === 'misc' && (
                  <div className="absolute top-2 left-2 bg-black/80 rounded-lg px-2 py-1.5 max-w-[70%] z-[5]">
                    <p className="text-[10px] font-mono text-pink-300">{m.public_id}</p>
                    <p className="text-[9px] text-white truncate">{set.name || 'Standalone'}</p>
                  </div>
                )}
                <img src="/ga-mark.png" alt="" className="absolute top-3 right-3 h-14 w-14 object-contain drop-shadow-lg pointer-events-none z-[5]" />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] bg-black/70 text-gray-200 px-2 py-1 rounded-full">Tap to expand</span>
              </button>
              {stackNav}
              <div className="mt-4 text-center">
                <p className="text-lg font-bold">{title}</p>
                <p className="text-xs text-gray-400 mt-1 capitalize">
                  {m.type}{m.character_name ? ` · ${m.character_name}` : ''}{set.name ? ` · ${set.name}` : ''}
                </p>
                {o.edition_number && <p className="text-sm text-amber-300 mt-2">{o.edition_number} of {o.edition_total}</p>}
                <p className="text-[11px] text-pink-400 font-mono mt-2">{o.instance_id}</p>
                <p className="text-[10px] text-gray-500 mt-1">Paid {Number(o.purchase_price || 0).toLocaleString()} BabeBucks</p>
              </div>
              <button type="button" onClick={() => downloadOwnedMedia(mediaUrl, title)}
                className="w-full mt-4 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm font-semibold">⬇ Download</button>
              {tradeSell}
              <button type="button" onClick={() => setViewOwned(null)} className="w-full mt-3 text-sm text-gray-400 hover:text-white py-2">Close</button>
            </div>
          </div>
        )
      })()}

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
