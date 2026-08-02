// pages/game.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Game() {
  const router = useRouter()
  const [marquee, setMarquee] = useState([])
  const [publishedCards, setPublishedCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('home') // home | packs | collection | shop | shows
  const [tokens, setTokens] = useState(0)
  const [stars, setStars] = useState(0)
  const [displayName, setDisplayName] = useState('Player')
  // landscape banners per tab — set in Settings
  const [tabBanners, setTabBanners] = useState({})
  const [tabTitles, setTabTitles] = useState({
    home: 'Home',
    packs: 'FREEBIES',
    shop: 'Shop',
    collection: 'My Collection',
    shows: 'Shows',
  })
  // Shows competition
  const [currentShow, setCurrentShow] = useState(null)
  const [showEntries, setShowEntries] = useState([])
  const [myShowVotes, setMyShowVotes] = useState({}) // entry_id -> 1 | -1
  const [myShowReactions, setMyShowReactions] = useState({}) // entry_id -> emoji
  const [lastShowWinner, setLastShowWinner] = useState(null)
  const [showBusy, setShowBusy] = useState(false)
  const SHOW_EMOJIS = ['🔥', '😍', '👏', '💯', '👑', '✨', '🥰', '😱']
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
  const [freebies, setFreebies] = useState([])
  const [claimingFreebie, setClaimingFreebie] = useState(null)
  const [tokenAnim, setTokenAnim] = useState(false) // play coin mp4 briefly on spend/earn
  const tokenAnimRef = useRef(null)
  const [buying, setBuying] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem('ga_muted') === '1' } catch { return false }
  })
  const [volumeMode, setVolumeMode] = useState(() => {
    try { return localStorage.getItem('ga_volume_mode') === 'low' ? 'low' : 'normal' } catch { return 'normal' }
  })
  // Keep refs so apply always uses latest values (avoids stale closures)
  const mutedRef = useRef(muted)
  const volumeModeRef = useRef(volumeMode)
  mutedRef.current = muted
  volumeModeRef.current = volumeMode

  // Low = 65% of full. iOS often ignores volume and only respects muted.
  const mediaVolume = muted ? 0 : (volumeMode === 'low' ? 0.65 : 1)
  const applyMediaVolume = () => {
    const isMuted = !!mutedRef.current
    const mode = volumeModeRef.current
    const vol = isMuted ? 0 : (mode === 'low' ? 0.65 : 1)
    if (typeof document === 'undefined') return
    // Sound-capable clips only (not silent grid thumbs)
    const nodes = document.querySelectorAll('video[data-ga-sound], audio[data-ga-sound]')
    nodes.forEach((el) => {
      try {
        el.defaultMuted = isMuted
        el.muted = isMuted
        // volume is ignored on many iOS browsers but works on Android/desktop
        el.volume = Math.max(0, Math.min(1, vol))
      } catch {}
    })
  }
  const toggleMuted = () => {
    setMuted(prev => {
      const next = !prev
      mutedRef.current = next
      try { localStorage.setItem('ga_muted', next ? '1' : '0') } catch {}
      // apply immediately with new value
      setTimeout(applyMediaVolume, 0)
      return next
    })
  }
  const setVolumeModePersist = (mode) => {
    volumeModeRef.current = mode
    setVolumeMode(mode)
    try { localStorage.setItem('ga_volume_mode', mode) } catch {}
    setTimeout(applyMediaVolume, 0)
  }
  useEffect(() => {
    applyMediaVolume()
    // Re-apply when new videos mount (reveal / shop intro)
    if (typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(() => applyMediaVolume())
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [muted, volumeMode])
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
  const MISC_MULTI_PRICE = 500 // 3 qty bundle
  const MISC_SET_PRICE = 700
  const VIDEO_UNLOCK_PRICE = 100

  const NAME_FONTS = {
    impact: { family: 'Impact, Haettenschweiler, sans-serif', weight: 900 },
    arialblack: { family: '"Arial Black", "Helvetica Neue", sans-serif', weight: 900 },
    georgia: { family: 'Georgia, serif', weight: 700 },
    system: { family: 'system-ui, sans-serif', weight: 800 },
    mono: { family: 'ui-monospace, monospace', weight: 700 },
  }
  const nameOverlayStyle = (fontId, pos) => {
    const f = NAME_FONTS[fontId] || NAME_FONTS.impact
    const base = {
      fontFamily: f.family,
      fontWeight: f.weight,
      color: '#fff',
      textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)',
      letterSpacing: '0.04em',
      pointerEvents: 'none',
      zIndex: 6,
      position: 'absolute',
      fontSize: '0.85rem',
      lineHeight: 1.1,
      maxWidth: '70%',
      padding: '0 6px',
    }
    if (pos === 'h-top-left') return { ...base, top: 8, left: 8 }
    if (pos === 'h-top-right') return { ...base, top: 8, right: 8, textAlign: 'right' }
    if (pos === 'h-bottom-left') return { ...base, bottom: 8, left: 8 }
    if (pos === 'h-bottom-right') return { ...base, bottom: 8, right: 8, textAlign: 'right' }
    if (pos === 'v-upper-left') return { ...base, top: 12, left: 4, writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxWidth: 'none' }
    if (pos === 'v-upper-right') return { ...base, top: 12, right: 4, writingMode: 'vertical-rl', maxWidth: 'none' }
    return { ...base, top: 8, left: 8 }
  }
  const NameOverlay = ({ name, font, position }) => {
    if (!name) return null
    return <span style={nameOverlayStyle(font, position)}>{name}</span>
  }

  // Sell back to system (fixed)
  const SYSTEM_BUYBACK_CARD = {
    common: 25,
    uncommon: 50,
    rare: 100,
    epic: 150,
    legendary: 200,
    'ultra elite': 250,
    ultra: 250,
    'after hours': 500,
    afterhours: 500,
  }
  const SYSTEM_BUYBACK_MEDIA = 100 // character media
  const SYSTEM_BUYBACK_MISC = 50
  const systemBuybackCard = (rarity) => {
    const key = String(rarity || 'common').toLowerCase()
    return SYSTEM_BUYBACK_CARD[key] ?? SYSTEM_BUYBACK_CARD.common
  }
  const MEDIA_VIDEO_CHANCE = 0.18
  const BUCKS = 'BabeBucks'
  const TOKEN_ICON = '/icons/babe-bucks.png'
  const TOKEN_ANIM = '/icons/babe-bucks.mp4'

  const flashTokenCoin = () => {
    setTokenAnim(true)
    // restart video if already playing
    requestAnimationFrame(() => {
      const v = tokenAnimRef.current
      if (v) {
        try {
          v.currentTime = 0
          v.play().catch(() => {})
        } catch {}
      }
    })
    setTimeout(() => setTokenAnim(false), 1600)
  }

  const TokenBalance = ({ amount, size = 'md', className = '' }) => {
    const iconCls = size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
    const textCls = size === 'lg' ? 'text-3xl font-bold' : size === 'sm' ? 'text-sm font-semibold' : 'text-2xl font-bold'
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className={`relative ${iconCls} shrink-0`}>
          {tokenAnim ? (
            <video
              ref={tokenAnimRef}
              src={TOKEN_ANIM}
              className={`${iconCls} rounded-full object-cover`}
              autoPlay
              muted
              playsInline
              onEnded={() => setTokenAnim(false)}
            />
          ) : (
            <img src={TOKEN_ICON} alt="" className={`${iconCls} rounded-full object-cover`} />
          )}
        </div>
        <span className={textCls}>{Number(amount || 0).toLocaleString()}</span>
      </div>
    )
  }

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

    // Scrolling home banner: Gallery folder "Main Banner" only (deduped by media id)
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
      const idSet = new Set()
      for (const x of fis || []) {
        const k = String(x.item_key || '')
        let id = null
        if (k.startsWith('gal_')) id = k.slice(4)
        else if (/^[0-9a-f-]{36}$/i.test(k)) id = k
        if (id) idSet.add(id)
      }
      const ids = [...idSet]
      if (ids.length) {
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
        // dedupe by id again after fetch
        const seen = new Set()
        strip = []
        for (const f of media) {
          if (seen.has(f.id)) continue
          seen.add(f.id)
          strip.push(mapBanner(f))
        }
      }
    }
    setMarquee(strip)

    const { data: settings } = await supabase
      .from('user_settings')
      .select('tokens, tab_banners, tab_titles, shop_intro_url, stars, display_name')
      .eq('id', 1)
      .maybeSingle()
    setTokens(settings?.tokens ?? 0)
    setStars(settings?.stars ?? 0)
    setDisplayName(settings?.display_name || 'Player')
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
      .select('id, instance_id, media_id, purchase_price, edition_number, edition_total, sale_count, current_sale_price, acquired_via, created_at, character_media(id, character_name, type, url, title, edition_size, overlay_name, overlay_font, overlay_position)')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedMedia(ownedM || [])

    const { data: ownedX } = await supabase
      .from('player_misc')
      .select('id, instance_id, misc_item_id, purchase_price, acquired_via, created_at, misc_items(id, type, url, title, public_id, sort_index, set_id, overlay_name, overlay_font, overlay_position, misc_sets(id, name, code_prefix))')
      .eq('owner_id', 1)
      .order('created_at', { ascending: false })
    setOwnedMisc(ownedX || [])

    const { data: fb } = await supabase
      .from('freebies')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    // Hide sold-out freebies after 24h past the moment they hit max redemptions
    // (we approximate with updated_at if present, else created_at + still show until 24h after created when sold out)
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const visible = (fb || []).filter(row => {
      const left = Math.max(0, (row.max_redemptions || 0) - (row.redemption_count || 0))
      if (left > 0) return true
      const soldAt = new Date(row.sold_out_at || row.updated_at || row.created_at).getTime()
      return now - soldAt < DAY
    })
    setFreebies(visible)

    // Shows competition
    try {
      await ensureAndLoadShow()
    } catch (e) {
      console.warn('shows load', e)
    }

    setLoading(false)
  }

  // --- Shows: periods end at noon & midnight America/Chicago (CST/CDT); lock last hour ---
  const CHICAGO_TZ = 'America/Chicago'
  const chicagoParts = (date = new Date()) => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const map = {}
    for (const { type, value } of fmt.formatToParts(date)) {
      if (type !== 'literal') map[type] = value
    }
    // hour12:false can still yield "24" in some engines for midnight — normalize
    let hour = parseInt(map.hour, 10)
    if (hour === 24) hour = 0
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour,
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10),
    }
  }
  // Build a UTC Date that is Y-M-D H:00:00 in Chicago
  const chicagoWallToUtc = (year, month, day, hour) => {
    // Approximate: start from UTC guess, then nudge by Chicago offset
    let guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0))
    for (let i = 0; i < 3; i++) {
      const p = chicagoParts(guess)
      const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
      const wantMs = Date.UTC(year, month - 1, day, hour, 0, 0, 0)
      guess = new Date(guess.getTime() + (wantMs - asUtcMs))
    }
    return guess
  }
  const getShowWindow = (date = new Date()) => {
    const p = chicagoParts(date)
    const midnight = chicagoWallToUtc(p.year, p.month, p.day, 0)
    const noon = chicagoWallToUtc(p.year, p.month, p.day, 12)
    // next midnight = tomorrow 00:00 Chicago
    const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
    const nd = chicagoParts(new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0))) // mid-day same calendar day UTC-ish
    // safer next calendar day in Chicago:
    const tomorrowProbe = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    // if still same Chicago day, add more
    let probe = new Date(date.getTime() + 12 * 60 * 60 * 1000)
    while (true) {
      const pp = chicagoParts(probe)
      if (pp.year !== p.year || pp.month !== p.month || pp.day !== p.day) break
      probe = new Date(probe.getTime() + 60 * 60 * 1000)
    }
    const tp = chicagoParts(probe)
    const nextMidnight = chicagoWallToUtc(tp.year, tp.month, tp.day, 0)
    if (date < noon) {
      return { startsAt: midnight, endsAt: noon }
    }
    return { startsAt: noon, endsAt: nextMidnight }
  }

  const showStatusFor = (endsAt, now = new Date()) => {
    const msLeft = endsAt.getTime() - now.getTime()
    if (msLeft <= 0) return 'closed'
    if (msLeft <= 60 * 60 * 1000) return 'locked' // last hour: no new entries
    return 'open'
  }

  const ensureAndLoadShow = async () => {
    const { startsAt, endsAt } = getShowWindow()
    const now = new Date()
    const status = showStatusFor(endsAt, now)

    // find or create current window
    let show = null
    const { data: existing } = await supabase
      .from('shows')
      .select('*')
      .eq('starts_at', startsAt.toISOString())
      .maybeSingle()
    if (existing) {
      show = existing
      if (existing.status !== status && status !== 'closed') {
        await supabase.from('shows').update({ status }).eq('id', existing.id)
        show = { ...existing, status }
      }
    } else {
      const { data: created, error } = await supabase
        .from('shows')
        .insert([{
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: status === 'closed' ? 'open' : status,
        }])
        .select()
        .single()
      if (!error && created) show = created
    }

    // close previous show & pick winner if needed
    const { data: prevOpen } = await supabase
      .from('shows')
      .select('*')
      .lt('ends_at', now.toISOString())
      .neq('status', 'closed')
      .order('ends_at', { ascending: false })
      .limit(3)
    for (const prev of prevOpen || []) {
      await finalizeShow(prev)
    }

    // last winner for feature
    const { data: lastClosed } = await supabase
      .from('shows')
      .select('*, show_entries!shows_winner_entry_id_fkey(*)')
      .eq('status', 'closed')
      .not('winner_entry_id', 'is', null)
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastClosed?.winner_entry_id) {
      const { data: winEntry } = await supabase
        .from('show_entries')
        .select('*')
        .eq('id', lastClosed.winner_entry_id)
        .maybeSingle()
      setLastShowWinner(winEntry || null)
    } else {
      setLastShowWinner(null)
    }

    setCurrentShow(show)
    if (show) {
      const { data: entries } = await supabase
        .from('show_entries')
        .select('*')
        .eq('show_id', show.id)
        .order('created_at', { ascending: false })
      // sort by score desc for display
      const sorted = (entries || []).slice().sort((a, b) => {
        const sa = (a.upvotes || 0) - (a.downvotes || 0)
        const sb = (b.upvotes || 0) - (b.downvotes || 0)
        return sb - sa
      })
      setShowEntries(sorted)

      const { data: votes } = await supabase
        .from('show_votes')
        .select('entry_id, value')
        .eq('voter_id', 1)
      const vmap = {}
      for (const v of votes || []) vmap[v.entry_id] = v.value
      setMyShowVotes(vmap)

      const { data: reacts } = await supabase
        .from('show_reactions')
        .select('entry_id, emoji')
        .eq('reactor_id', 1)
      const rmap = {}
      for (const r of reacts || []) rmap[r.entry_id] = r.emoji
      setMyShowReactions(rmap)
    } else {
      setShowEntries([])
    }
  }

  const finalizeShow = async (show) => {
    if (!show?.id || show.status === 'closed') return
    const { data: entries } = await supabase
      .from('show_entries')
      .select('*')
      .eq('show_id', show.id)
    let winner = null
    let best = -Infinity
    for (const e of entries || []) {
      const score = (e.upvotes || 0) - (e.downvotes || 0)
      if (score > best) { best = score; winner = e }
    }
    await supabase.from('shows').update({
      status: 'closed',
      winner_entry_id: winner?.id || null,
    }).eq('id', show.id)
    if (winner) {
      // stars for winner (+5) — only if owner is current player for now
      if (winner.owner_id === 1) {
        const { data: s } = await supabase.from('user_settings').select('stars').eq('id', 1).maybeSingle()
        const nextStars = (s?.stars || 0) + 5
        await supabase.from('user_settings').upsert({ id: 1, stars: nextStars })
        setStars(nextStars)
      }
    }
  }

  const canSubmitToShow = () => {
    if (!currentShow) return false
    const ends = new Date(currentShow.ends_at)
    return showStatusFor(ends) === 'open'
  }

  const myEntryCount = showEntries.filter(e => e.owner_id === 1).length

  const submitShowOff = async () => {
    if (!viewOwned || showBusy) return
    if (!canSubmitToShow()) {
      alert('Submissions are locked for the last hour of this Show (ends noon / midnight).')
      return
    }
    if (myEntryCount >= 2) {
      alert('You can only show off 2 items per Show.')
      return
    }
    const o = viewOwned.row
    let imageUrl = null
    let title = ''
    let kind = viewOwned.kind
    let sourceId = o.id

    if (kind === 'card') {
      const c = o.cards || {}
      imageUrl = c.image_url // front only, static
      title = c.name || 'Card'
      if (!imageUrl) { alert('This card has no front image'); return }
    } else if (kind === 'media') {
      const m = o.character_media || {}
      if (m.type === 'video') { alert('Shows only allow static images (no animations)'); return }
      imageUrl = m.url
      title = m.title || m.character_name || 'Media'
    } else if (kind === 'misc') {
      const m = o.misc_items || {}
      if (m.type === 'video') { alert('Shows only allow static images (no animations)'); return }
      imageUrl = m.url
      title = m.public_id || m.title || 'Misc'
    } else {
      return
    }
    if (!imageUrl) { alert('No image to show off'); return }

    setShowBusy(true)
    try {
      if (!currentShow) await ensureAndLoadShow()
      const show = currentShow
      if (!show?.id) { alert('No active Show'); setShowBusy(false); return }

      const { error } = await supabase.from('show_entries').insert([{
        show_id: show.id,
        owner_id: 1,
        username: displayName || 'Player',
        kind,
        source_id: sourceId,
        image_url: imageUrl,
        title,
        upvotes: 0,
        downvotes: 0,
      }])
      if (error) throw new Error(error.message)
      // +1 star for participating
      const nextStars = (stars || 0) + 1
      await supabase.from('user_settings').upsert({ id: 1, stars: nextStars })
      setStars(nextStars)
      await ensureAndLoadShow()
      alert('Submitted to the Show! ⭐ +1 star')
      setViewOwned(null)
    } catch (err) {
      alert('Show off failed: ' + err.message)
    }
    setShowBusy(false)
  }

  const voteShowEntry = async (entry, value) => {
    // value: 1 | -1 | 0 (clear)
    if (!entry?.id || showBusy) return
    if (entry.owner_id === 1) { alert("You can't vote on your own entry"); return }
    setShowBusy(true)
    try {
      const existing = myShowVotes[entry.id]
      if (value === 0 || existing === value) {
        // remove vote
        await supabase.from('show_votes').delete().eq('entry_id', entry.id).eq('voter_id', 1)
        let up = entry.upvotes || 0
        let down = entry.downvotes || 0
        if (existing === 1) up = Math.max(0, up - 1)
        if (existing === -1) down = Math.max(0, down - 1)
        await supabase.from('show_entries').update({ upvotes: up, downvotes: down }).eq('id', entry.id)
        setMyShowVotes(prev => { const n = { ...prev }; delete n[entry.id]; return n })
      } else {
        // upsert vote
        await supabase.from('show_votes').upsert({
          entry_id: entry.id,
          voter_id: 1,
          value,
        }, { onConflict: 'entry_id,voter_id' })
        let up = entry.upvotes || 0
        let down = entry.downvotes || 0
        if (existing === 1) up = Math.max(0, up - 1)
        if (existing === -1) down = Math.max(0, down - 1)
        if (value === 1) up += 1
        if (value === -1) down += 1
        await supabase.from('show_entries').update({ upvotes: up, downvotes: down }).eq('id', entry.id)
        setMyShowVotes(prev => ({ ...prev, [entry.id]: value }))
      }
      await ensureAndLoadShow()
    } catch (err) {
      alert(err.message)
    }
    setShowBusy(false)
  }

  const reactShowEntry = async (entry, emoji) => {
    if (!entry?.id || showBusy) return
    setShowBusy(true)
    try {
      if (myShowReactions[entry.id] === emoji) {
        await supabase.from('show_reactions').delete().eq('entry_id', entry.id).eq('reactor_id', 1)
        setMyShowReactions(prev => { const n = { ...prev }; delete n[entry.id]; return n })
      } else {
        await supabase.from('show_reactions').delete().eq('entry_id', entry.id).eq('reactor_id', 1)
        await supabase.from('show_reactions').insert([{ entry_id: entry.id, reactor_id: 1, emoji }])
        setMyShowReactions(prev => ({ ...prev, [entry.id]: emoji }))
      }
    } catch (err) {
      alert(err.message)
    }
    setShowBusy(false)
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

  const claimFreebie = async (fb) => {
    if (!fb || claimingFreebie) return
    if (fb.redemption_count >= fb.max_redemptions) {
      alert('This freebie is sold out')
      return
    }
    setClaimingFreebie(fb.id)
    try {
      // already claimed?
      const { data: existing } = await supabase
        .from('freebie_claims')
        .select('id')
        .eq('freebie_id', fb.id)
        .eq('owner_id', 1)
        .maybeSingle()
      if (existing) {
        alert('You already claimed this freebie')
        setClaimingFreebie(null)
        return
      }

      // re-check stock
      const { data: fresh } = await supabase.from('freebies').select('*').eq('id', fb.id).single()
      if (!fresh || !fresh.active || fresh.redemption_count >= fresh.max_redemptions) {
        alert('While supplies last — this one is gone')
        setClaimingFreebie(null)
        await load()
        return
      }

      const { error: cErr } = await supabase.from('freebie_claims').insert([{
        freebie_id: fb.id,
        owner_id: 1,
      }])
      if (cErr) {
        if (String(cErr.message || '').includes('duplicate') || cErr.code === '23505') {
          alert('You already claimed this freebie')
        } else {
          alert(cErr.message)
        }
        setClaimingFreebie(null)
        return
      }

      const nextCount = (fresh.redemption_count || 0) + 1
      const patch = { redemption_count: nextCount }
      if (nextCount >= (fresh.max_redemptions || 0)) {
        patch.sold_out_at = new Date().toISOString()
      }
      await supabase.from('freebies').update(patch).eq('id', fb.id)

      if (fresh.type === 'tokens') {
        const amt = Number(fresh.token_amount) || 0
        const newBal = tokens + amt
        await supabase.from('user_settings').upsert({ id: 1, tokens: newBal })
        setTokens(newBal)
        flashTokenCoin()
        alert(`+${amt.toLocaleString()} BabeBucks claimed!`)
      } else if (fresh.type === 'media' && fresh.media_url) {
        // grant as player_misc if we can find matching misc_item, else create owned misc-like entry via player_misc optional
        // Prefer insert into player_misc linked to misc_item_id if set
        if (fresh.misc_item_id) {
          const instanceId = 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase()
          await supabase.from('player_misc').insert([{
            instance_id: instanceId,
            misc_item_id: fresh.misc_item_id,
            owner_id: 1,
            purchase_price: 0,
            acquired_via: 'freebie',
          }])
        } else if (fresh.character_media_id) {
          const instanceId = 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase()
          await supabase.from('player_media').insert([{
            instance_id: instanceId,
            media_id: fresh.character_media_id,
            owner_id: 1,
            purchase_price: 0,
            acquired_via: 'freebie',
            edition_number: 1,
            edition_total: 1,
          }])
        } else {
          // standalone free media → create misc item + claim
          const publicId = 'FREE' + Date.now().toString().slice(-6)
          const { data: item } = await supabase.from('misc_items').insert([{
            type: fresh.media_type || 'image',
            url: fresh.media_url,
            title: fresh.title || 'Freebie',
            public_id: publicId,
            sort_index: 1,
            published: true,
          }]).select().single()
          if (item) {
            const instanceId = 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase()
            await supabase.from('player_misc').insert([{
              instance_id: instanceId,
              misc_item_id: item.id,
              owner_id: 1,
              purchase_price: 0,
              acquired_via: 'freebie',
            }])
          }
        }
        alert('Free media claimed! Check My Collection.')
      } else {
        alert('Claimed!')
      }
      await load()
    } catch (err) {
      alert('Claim failed: ' + err.message)
    }
    setClaimingFreebie(null)
  }

  const sellToSystem = async () => {
    if (!viewOwned) return
    const o = viewOwned.row
    if (!o?.id) return

    let price = 0
    let label = 'item'
    if (viewOwned.kind === 'card') {
      const c = o.cards || {}
      price = systemBuybackCard(c.rarity)
      label = c.name || 'card'
    } else if (viewOwned.kind === 'media') {
      price = SYSTEM_BUYBACK_MEDIA
      const m = o.character_media || {}
      label = m.title || m.character_name || 'media'
    } else if (viewOwned.kind === 'misc') {
      price = SYSTEM_BUYBACK_MISC
      const m = o.misc_items || {}
      label = m.public_id || m.title || 'misc'
    } else {
      return
    }

    if (!confirm(`Sell ${label} back to the system for ${price} BabeBucks?\n\nThis cannot be undone.`)) return

    try {
      if (viewOwned.kind === 'card') {
        const { error } = await supabase.from('player_cards').delete().eq('id', o.id)
        if (error) throw new Error(error.message)
        setOwnedCards(prev => prev.filter(x => x.id !== o.id))
      } else if (viewOwned.kind === 'media') {
        const { error } = await supabase.from('player_media').delete().eq('id', o.id)
        if (error) throw new Error(error.message)
        setOwnedMedia(prev => prev.filter(x => x.id !== o.id))
      } else if (viewOwned.kind === 'misc') {
        const { error } = await supabase.from('player_misc').delete().eq('id', o.id)
        if (error) throw new Error(error.message)
        setOwnedMisc(prev => prev.filter(x => x.id !== o.id))
      }

      const newBalance = tokens + price
      const { error: tErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tErr) throw new Error(tErr.message)
      setTokens(newBalance)
      flashTokenCoin()
      setViewOwned(null)
      setPlayOwnedVideo(false)
      alert(`Sold for ${price} BabeBucks`)
    } catch (err) {
      alert('Sell failed: ' + err.message)
    }
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
    flashTokenCoin()
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
      flashTokenCoin()
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


  const buyMiscRandom = async (qty = 1) => {
    qty = Math.max(1, Math.min(10, parseInt(qty) || 1))
    const price = qty >= 3 ? MISC_MULTI_PRICE : MISC_SINGLE_PRICE * qty
    if (tokens < price) {
      alert(`Need ${price} ${BUCKS}`)
      return
    }
    if (!confirm(qty === 1
      ? `Random Misc Beauty for ${price} ${BUCKS}?`
      : `${qty} random Misc for ${price} ${BUCKS}?`)) return

    setBuying(true)
    try {
      const { data: pool } = await supabase
        .from('misc_items')
        .select('id, url, type, public_id, title, set_id')
        .eq('published', true)
      if (!pool?.length) {
        alert('No misc items published yet')
        setBuying(false)
        return
      }

      const newBalance = tokens - price
      const { error: tErr } = await supabase.from('user_settings').upsert({ id: 1, tokens: newBalance })
      if (tErr) { alert(tErr.message); setBuying(false); return }

      const picks = []
      for (let i = 0; i < qty; i++) {
        const item = pool[Math.floor(Math.random() * pool.length)]
        const instanceId = 'MSC-' + Math.random().toString(36).slice(2, 8).toUpperCase()
        const { data: row, error } = await supabase.from('player_misc').insert([{
          instance_id: instanceId,
          misc_item_id: item.id,
          owner_id: 1,
          purchase_price: Math.round(price / qty),
          acquired_via: 'shop',
        }]).select('id, instance_id, misc_item_id, purchase_price, acquired_via, created_at').single()
        if (error) {
          await supabase.from('user_settings').upsert({ id: 1, tokens })
          alert(error.message)
          setBuying(false)
          return
        }
        picks.push({ ...row, misc_items: item })
      }

      setTokens(newBalance)
      flashTokenCoin()
      setOwnedMisc(prev => [...picks, ...prev])

      // Same pack reveal animation as mystery cards / character media
      const packItems = picks.map(p => ({
        kind: 'misc',
        miscItem: p.misc_items,
        instanceId: p.instance_id,
        price: p.purchase_price,
      }))
      const skin = randomSkin()
      setReveal({
        phase: 'anim',
        kind: 'misc',
        miscItem: picks[0].misc_items,
        instanceId: picks[0].instance_id,
        price,
        video: skin.video,
        packItems,
        packIndex: 0,
        packWon: picks.length,
        packSize: qty,
      })
    } catch (err) {
      alert(err.message)
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
      flashTokenCoin()
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
      const skin = randomSkin()
      setReveal({
        phase: 'anim',
        kind: 'misc',
        miscItem: won[0].item,
        instanceId: won[0].row.instance_id,
        price,
        video: skin.video,
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
      flashTokenCoin()
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
        if (first.kind === 'media') {
          return {
            ...prev,
            phase: 'show',
            packIndex: 0,
            kind: 'media',
            media: first.media,
            instanceId: first.instanceId,
            editionNumber: first.editionNumber,
            editionTotal: first.editionTotal,
            trim: first.trim,
          }
        }
        if (first.kind === 'misc') {
          return {
            ...prev,
            phase: 'show',
            packIndex: 0,
            kind: 'misc',
            miscItem: first.miscItem,
            instanceId: first.instanceId,
            price: first.price ?? prev.price,
          }
        }
        return {
          ...prev,
          phase: 'show',
          packIndex: 0,
          kind: 'card',
          card: first.card,
          instanceId: first.instanceId,
          editionNumber: first.editionNumber,
          editionTotal: first.editionTotal,
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
          <button
            type="button"
            onClick={() => setShowUserSettings(true)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-base hover:bg-white/10"
            aria-label="Settings"
          >
            ⚙
          </button>
          <img src="/goddess-arena-logo.png" alt="Goddess Arena" className="h-16 object-contain" />
          <button onClick={() => {
            try { sessionStorage.setItem('skip_auto_game', '1') } catch {}
            router.push('/')
          }} className="text-xs text-gray-400 hover:text-white">
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
                      <img src={b.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                    <img src={b.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-lg mx-auto px-4 mt-8 space-y-3 pb-24">
            <p className="text-[10px] tracking-[0.25em] uppercase text-gray-500 mb-1">Play</p>

            <button onClick={() => openTab('packs')} className="w-full text-left bg-gradient-to-r from-emerald-700 to-teal-800 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{tabTitles.packs || 'FREEBIES'}</p>
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
                <img src={TOKEN_ICON} alt="" className="w-8 h-8 rounded-full object-cover" />
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

            <button onClick={() => openTab('shows')} className="w-full text-left bg-gray-900 border border-fuchsia-900/40 rounded-2xl p-4 active:scale-[0.98] transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{tabTitles.shows || 'Shows'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Show off · vote · win stars</p>
                </div>
                <span className="text-2xl">✨</span>
              </div>
            </button>

            <div className="mt-8 rounded-2xl border border-pink-900/40 bg-pink-950/30 p-4">
              <p className="text-xs text-pink-300 font-semibold mb-1">BabeBucks</p>
              <TokenBalance amount={tokens} size="lg" />
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
                                <img src="/ga-mark.png" alt="" className="absolute top-3 right-2 h-16 w-16 object-contain drop-shadow-lg pointer-events-none z-[5]" />
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
                                <img src="/ga-mark.png" alt="" className="absolute top-4 right-1.5 object-contain drop-shadow-lg pointer-events-none z-[5]" style={{ height: '4.25rem', width: '4.25rem' }} />
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
              <div className="flex items-center gap-3">
                <img src={TOKEN_ICON} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                <div>
                  <p className="text-3xl font-bold leading-none">{Number(tokens).toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">BabeBucks</p>
                </div>
              </div>
            </div>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2">BabeBucks packs</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {TOKEN_PACKS.map(tp => (
                <button key={tp.amount} disabled className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-left opacity-70 flex items-center gap-2.5">
                  <img src={TOKEN_ICON} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-pink-300">{tp.amount.toLocaleString()} BB</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{tp.price}</p>
                  </div>
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
                      <p className="text-pink-400 text-xs font-semibold mt-1 inline-flex items-center gap-1.5">
                        <img src={TOKEN_ICON} alt="" className="w-4 h-4 rounded-full object-cover" />
                        {TIER_PRICE[t.tier]} BB each
                      </p>
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
                  <p className="text-pink-400 text-xs font-semibold mt-2 inline-flex items-center gap-1.5">
                    <img src={TOKEN_ICON} alt="" className="w-4 h-4 rounded-full" />
                    {MEDIA_SINGLE_PRICE.toLocaleString()} BB
                  </p>
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
                  <p className="text-pink-400 text-xs font-semibold mt-2 inline-flex items-center gap-1.5">
                    <img src={TOKEN_ICON} alt="" className="w-4 h-4 rounded-full" />
                    {MEDIA_MULTI_PRICE.toLocaleString()} BB
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-2 mt-6">Misc Beauties</p>
            <p className="text-[10px] text-gray-600 mb-3">
              Random images/videos not tied to a character card. Unlimited supply of each item.
            </p>
            <div className="space-y-2 mb-8">
              <button
                onClick={() => buyMiscRandom(1)}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src={MYSTERY_SKINS[0]?.image || '/mystery-card-1.jpg'} alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Random Misc · 1 qty</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Standalone beauty drop</p>
                  <p className="text-pink-400 text-xs font-semibold mt-2 inline-flex items-center gap-1.5">
                    <img src={TOKEN_ICON} alt="" className="w-4 h-4 rounded-full" />
                    {MISC_SINGLE_PRICE} BB
                  </p>
                </div>
              </button>
              <button
                onClick={() => buyMiscRandom(3)}
                disabled={buying}
                className="w-full flex gap-3 items-center text-left bg-gray-900 border border-pink-900/40 rounded-2xl p-3 disabled:opacity-50"
              >
                <img src={MYSTERY_SKINS[1]?.image || '/mystery-card-2.jpg'} alt="" className="w-14 rounded-lg object-cover aspect-[3/4]" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Misc Multi · 3 qty</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Three random misc drops</p>
                  <p className="text-pink-400 text-xs font-semibold mt-2 inline-flex items-center gap-1.5">
                    <img src={TOKEN_ICON} alt="" className="w-4 h-4 rounded-full" />
                    {MISC_MULTI_PRICE} BB
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'packs' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.packs || "FREEBIES"} />
          <TabBanner tabKey="packs" />
          <div className="max-w-lg mx-auto px-4">
            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-4 mb-5">
              <p className="font-bold text-lg text-emerald-200">Random Freebies</p>
              <p className="text-xs text-emerald-200/70 mt-1">(while supplies last)</p>
              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                Continue to check regularly for miscellaneous free stuff.
              </p>
            </div>

            {freebies.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
                <p className="text-3xl mb-2">🎁</p>
                <p className="text-sm text-gray-400">No freebies right now</p>
                <p className="text-xs text-gray-600 mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-3">
                {freebies.map(fb => {
                  const left = Math.max(0, (fb.max_redemptions || 0) - (fb.redemption_count || 0))
                  const soldOut = left <= 0
                  return (
                    <div key={fb.id} className={`rounded-2xl border p-4 ${soldOut ? 'border-gray-800 bg-gray-900/40 opacity-60' : 'border-emerald-800/40 bg-gray-900'}`}>
                      <div className="flex gap-3">
                        {fb.type === 'media' && fb.media_url ? (
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-800 shrink-0">
                            {fb.media_type === 'video' ? (
                              <video src={fb.media_url} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              <img src={fb.media_url} alt="" className="w-full h-full object-cover" />
                            )}
                            {soldOut && (
                              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                <span className="text-[8px] font-bold tracking-wide text-red-300 text-center leading-tight px-0.5">UNAVAILABLE</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="relative w-16 h-16 rounded-lg bg-emerald-900/50 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                            💎
                            {soldOut && (
                              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                <span className="text-[8px] font-bold tracking-wide text-red-300 text-center leading-tight px-0.5">UNAVAILABLE</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{fb.title || (fb.type === 'tokens' ? 'BabeBucks drop' : 'Free media')}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {fb.type === 'tokens'
                              ? `${Number(fb.token_amount || 0).toLocaleString()} BB`
                              : 'Free media item'}
                          </p>
                          <p className="text-[10px] text-emerald-400/80 mt-1">
                            {soldOut ? 'Sold out' : `${left} of ${fb.max_redemptions} left`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={soldOut || claimingFreebie === fb.id}
                        onClick={() => claimFreebie(fb)}
                        className="w-full mt-3 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-xl py-2.5 text-sm font-semibold"
                      >
                        {soldOut ? 'Gone' : claimingFreebie === fb.id ? 'Claiming…' : 'Claim free'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
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

      {tab === 'shows' && (
        <div className="pt-16 pb-24">
          <TabHeader title={tabTitles.shows || 'Shows'} />
          <TabBanner tabKey="shows" />
          <div className="max-w-lg mx-auto px-4">
            {lastShowWinner && (
              <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/50 to-gray-900 p-4 mb-5">
                <p className="text-[10px] tracking-[0.2em] uppercase text-amber-400 mb-2">Last Show Winner</p>
                <div className="flex gap-3 items-center">
                  <img src={lastShowWinner.image_url} alt="" className="w-16 h-20 rounded-lg object-cover object-top" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{lastShowWinner.title}</p>
                    <p className="text-xs text-pink-300 mt-0.5">@{lastShowWinner.username || 'Player'}</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Score {(lastShowWinner.upvotes || 0) - (lastShowWinner.downvotes || 0)} · ⭐ prize TBD
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-fuchsia-900/40 bg-fuchsia-950/20 p-4 mb-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-fuchsia-200">Current Show</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Ends noon &amp; midnight CST · lock last hour
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-pink-300">⭐ {stars}</p>
                  <p className="text-[10px] text-gray-500">your stars</p>
                </div>
              </div>
              {currentShow && (
                <p className="text-[11px] text-gray-400 mt-3">
                  Status:{' '}
                  <span className="text-white font-semibold">
                    {showStatusFor(new Date(currentShow.ends_at))}
                  </span>
                  {' · '}
                  Ends {new Date(currentShow.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {' · '}
                  Your entries {myEntryCount}/2
                </p>
              )}
              <p className="text-[10px] text-gray-600 mt-2">
                From Harem: open a static image (card front, media, or misc) → Show off.
              </p>
            </div>

            {showEntries.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
                <p className="text-3xl mb-2">✨</p>
                <p className="text-sm text-gray-400">No entries yet</p>
                <p className="text-xs text-gray-600 mt-1">Be the first to show off</p>
              </div>
            ) : (
              <div className="space-y-4">
                {showEntries.map((entry, idx) => {
                  const score = (entry.upvotes || 0) - (entry.downvotes || 0)
                  const myVote = myShowVotes[entry.id]
                  const myReact = myShowReactions[entry.id]
                  return (
                    <div key={entry.id} className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                      <div className="relative">
                        <img src={entry.image_url} alt="" className="w-full max-h-80 object-cover object-top" />
                        {idx === 0 && (
                          <span className="absolute top-2 left-2 bg-amber-600/90 text-white text-[10px] font-bold px-2 py-1 rounded-full">#{idx + 1}</span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{entry.title}</p>
                            <p className="text-[11px] text-pink-300">@{entry.username || 'Player'}</p>
                          </div>
                          <p className="text-sm font-bold text-amber-300 shrink-0">{score > 0 ? '+' : ''}{score}</p>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            type="button"
                            disabled={showBusy || entry.owner_id === 1}
                            onClick={() => voteShowEntry(entry, 1)}
                            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${myVote === 1 ? 'bg-emerald-700' : 'bg-gray-800'}`}
                          >
                            ▲ {entry.upvotes || 0}
                          </button>
                          <button
                            type="button"
                            disabled={showBusy || entry.owner_id === 1}
                            onClick={() => voteShowEntry(entry, -1)}
                            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${myVote === -1 ? 'bg-red-800' : 'bg-gray-800'}`}
                          >
                            ▼ {entry.downvotes || 0}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {SHOW_EMOJIS.map(em => (
                            <button
                              key={em}
                              type="button"
                              disabled={showBusy}
                              onClick={() => reactShowEntry(entry, em)}
                              className={`w-9 h-9 rounded-full text-base ${myReact === em ? 'bg-pink-700 ring-2 ring-pink-400' : 'bg-gray-800'}`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
                data-ga-sound
                src={reveal.video || '/mystery-card-1.mp4'}
                autoPlay
                playsInline
                muted={muted}
                className="w-full max-w-sm rounded-2xl"
                onEnded={finishReveal}
                onError={finishReveal}
                onLoadedData={(e) => {
                  try {
                    e.target.muted = !!muted
                    e.target.volume = mediaVolume
                  } catch {}
                }}
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
                    <video
                      data-ga-sound
                      src={m.url}
                      controls
                      autoPlay
                      playsInline
                      muted={muted}
                      className="w-full max-h-[70vh]"
                      onLoadedData={(e) => {
                        try {
                          e.target.muted = !!muted
                          e.target.volume = mediaVolume
                        } catch {}
                      }}
                    />
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
                  <img src="/ga-mark.png" alt="" className="absolute top-4 right-2 h-18 w-18 object-contain drop-shadow-lg pointer-events-none" style={{ height: '4.5rem', width: '4.5rem' }} />
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
                  <video
                    data-ga-sound
                    src={reveal.media.url}
                    controls
                    muted={muted}
                    className="w-full"
                    onLoadedData={(e) => {
                      try {
                        e.target.muted = !!muted
                        e.target.volume = mediaVolume
                      } catch {}
                    }}
                  />
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
        const sellPrice = viewOwned.kind === 'card'
          ? systemBuybackCard((o.cards || {}).rarity)
          : viewOwned.kind === 'media'
            ? SYSTEM_BUYBACK_MEDIA
            : SYSTEM_BUYBACK_MISC
        const canShowOffImage = (() => {
          if (viewOwned.kind === 'card') return !!(o.cards || {}).image_url
          if (viewOwned.kind === 'media') {
            const m = o.character_media || {}
            return m.type !== 'video' && !!m.url
          }
          if (viewOwned.kind === 'misc') {
            const m = o.misc_items || {}
            return m.type !== 'video' && !!m.url
          }
          return false
        })()
        const tradeSell = (
          <div className="mt-3 space-y-2">
            {canShowOffImage && (
              <button
                type="button"
                disabled={showBusy || !canSubmitToShow() || myEntryCount >= 2}
                onClick={submitShowOff}
                className="w-full bg-fuchsia-800 hover:bg-fuchsia-700 disabled:opacity-40 rounded-xl py-3 text-sm font-semibold"
              >
                ✨ Show off {!canSubmitToShow() ? '(locked)' : myEntryCount >= 2 ? '(2/2 used)' : `(${myEntryCount}/2)`}
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => alert('Trade is coming soon')}
                className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm font-semibold border border-gray-700">Trade</button>
              <button type="button" onClick={sellToSystem}
                className="flex-1 bg-amber-900/80 hover:bg-amber-800 rounded-xl py-3 text-sm font-semibold border border-amber-700/50">
                Sell · {sellPrice} BB
              </button>
            </div>
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
                      <div className="absolute inset-x-0 bottom-0 h-[33%] bg-gradient-to-t from-black from-30% via-black/80 to-transparent" />
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
                          key={`own-vid-${o.id}-${muted}-${volumeMode}`}
                          data-ga-sound
                          src={c.video_url}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          autoPlay
                          loop
                          muted={muted}
                          playsInline
                          onLoadedData={(e) => {
                            try {
                              e.target.muted = !!muted
                              e.target.volume = mediaVolume
                            } catch {}
                          }}
                        />
                      ) : c.image_url ? (
                        <img src={c.image_url} alt={c.name || ''} className="absolute inset-0 w-full h-full object-cover object-top" />
                      ) : <div className="absolute inset-0 bg-gray-800" />}
                      {c.series_name && <span className="absolute top-3 left-3 text-lg drop-shadow z-[2]">👑</span>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 z-[5]">
                        <p className="font-bold text-[15px] leading-tight truncate pr-24">{c.name}</p>
                        {c.title && <p className="text-[10px] text-gray-300 uppercase tracking-[0.12em] mt-0.5 truncate pr-24">{c.title}</p>}
                      </div>
                      <img src="/ga-mark.png" alt="" className="absolute bottom-0.5 right-1 z-[20] h-28 w-28 object-contain drop-shadow-lg pointer-events-none" />
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
                <NameOverlay name={m.overlay_name} font={m.overlay_font} position={m.overlay_position} />
                {viewOwned.kind === 'misc' && (
                  <div className="absolute top-2 left-2 bg-black/80 rounded-lg px-2 py-1.5 max-w-[70%] z-[5]">
                    <p className="text-[10px] font-mono text-pink-300">{m.public_id}</p>
                    <p className="text-[9px] text-white truncate">{set.name || 'Standalone'}</p>
                  </div>
                )}
                <img src="/ga-mark.png" alt="" className="absolute top-4 right-2 object-contain drop-shadow-lg pointer-events-none z-[5]" style={{ height: '4.5rem', width: '4.5rem' }} />
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

      {/* Player settings */}
      {showUserSettings && (
        <div className="fixed inset-0 z-[95] bg-black/90 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl p-5 mb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Settings</h2>
              <button type="button" onClick={() => setShowUserSettings(false)} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
            </div>

            <button
              type="button"
              onClick={toggleMuted}
              className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-2"
            >
              <span className="text-sm font-semibold">{muted ? '🔇 Media muted' : '🔊 Media on'}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${muted ? 'bg-gray-700 text-gray-300' : 'bg-pink-700 text-white'}`}>
                {muted ? 'OFF' : 'ON'}
              </span>
            </button>
            <div className={`w-full flex gap-2 mb-3 ${muted ? 'opacity-40 pointer-events-none' : ''}`}>
              <button
                type="button"
                onClick={() => { setVolumeModePersist('normal'); setTimeout(applyMediaVolume, 0) }}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border ${
                  volumeMode === 'normal' ? 'bg-pink-800 border-pink-600 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}
              >
                Normal volume
              </button>
              <button
                type="button"
                onClick={() => { setVolumeModePersist('low'); setTimeout(applyMediaVolume, 0) }}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border ${
                  volumeMode === 'low' ? 'bg-pink-800 border-pink-600 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}
              >
                Low (−35%)
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mb-4 -mt-1 px-1">
              Mute works on all devices. Low (~65%) works on Android/desktop; iPhone often ignores volume and only mute is reliable.
              Play a shop intro or unlocked card animation to hear the change.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-3">
              <p className="text-sm font-semibold">⭐ Stars · {stars}</p>
              <p className="text-[11px] text-gray-500 mt-1">Earn stars in Shows (enter + win). Ranking coming soon.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-3 opacity-70">
              <p className="text-sm font-semibold">Account</p>
              <p className="text-[11px] text-gray-500 mt-1">Coming soon — profile, login, and BabeBucks history will live here.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-3 opacity-70">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-gray-500 mt-1">Coming soon — freebie drops, trades, and alerts.</p>
            </div>

            <button
              type="button"
              onClick={() => alert('Help: email support@goddessarena.app (placeholder).\n\nDescribe the issue and include screenshots if you can.')}
              className="w-full bg-gray-900 border border-gray-800 hover:bg-gray-800 rounded-xl px-4 py-3 text-left mb-2"
            >
              <p className="text-sm font-semibold">Help</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Report a problem or get support</p>
            </button>

            <button type="button" onClick={() => setShowUserSettings(false)} className="w-full mt-2 text-sm text-gray-400 hover:text-white py-2">
              Close
            </button>
          </div>
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
            data-ga-sound
            src={shopIntroUrl}
            autoPlay
            playsInline
            muted={muted}
            className="w-full h-full object-contain max-w-lg"
            onEnded={closeShopIntro}
            onError={closeShopIntro}
            onLoadedData={(e) => {
              try {
                e.target.muted = !!muted
                e.target.volume = mediaVolume
              } catch {}
            }}
          />
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-black/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-lg mx-auto grid grid-cols-5 text-center py-2 text-[10px] text-gray-500">
          <button onClick={() => openTab('home')} className={`py-2 ${tab === 'home' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🏠</div>{(tabTitles.home || 'Home').split(' ')[0]}
          </button>
          <button onClick={() => openTab('packs')} className={`py-2 ${tab === 'packs' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">🎁</div>{(tabTitles.packs || 'FREEBIES').split(' ')[0]}
          </button>
          <button onClick={() => openTab('shop')} className={`py-2 ${tab === 'shop' ? 'text-pink-400' : ''}`}>
            <div className="flex justify-center"><img src={TOKEN_ICON} alt="" className="w-6 h-6 rounded-full object-cover" /></div>
            {(tabTitles.shop || 'Shop').split(' ')[0]}
          </button>
          <button onClick={() => openTab('collection')} className={`py-2 ${tab === 'collection' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">💎</div>{(tabTitles.collection || 'Mine').split(' ')[0]}
          </button>
          <button onClick={() => openTab('shows')} className={`py-2 ${tab === 'shows' ? 'text-pink-400' : ''}`}>
            <div className="text-lg">✨</div>{(tabTitles.shows || 'Shows').split(' ')[0]}
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
