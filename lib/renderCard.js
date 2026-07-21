// lib/renderCard.js
// Draws a card (front + back, side by side) to a canvas at print resolution
// and triggers a PNG download.

const CARD_W = 1500
const CARD_H = 2000
const GAP = 60
const PAD = 60

const RARITY_PALETTE = {
  common: {
    edge: ['#6b7280', '#1f2937', '#9ca3af', '#374151'],
    badgeBg: 'rgba(75,85,99,0.85)',
    badgeText: '#e5e7eb',
    glow: null,
    foil: 0,
  },
  uncommon: {
    edge: ['#34d399', '#065f46', '#6ee7b7', '#047857'],
    badgeBg: 'rgba(5,95,70,0.85)',
    badgeText: '#a7f3d0',
    glow: 'rgba(52,211,153,0.45)',
    foil: 0,
  },
  rare: {
    edge: ['#93c5fd', '#1e3a8a', '#bfdbfe', '#1d4ed8'],
    badgeBg: 'rgba(30,58,138,0.85)',
    badgeText: '#bfdbfe',
    glow: 'rgba(96,165,250,0.5)',
    foil: 0.16,
  },
  epic: {
    edge: ['#d8b4fe', '#581c87', '#f0abfc', '#7e22ce'],
    badgeBg: 'rgba(88,28,135,0.85)',
    badgeText: '#e9d5ff',
    glow: 'rgba(192,132,252,0.55)',
    foil: 0.2,
  },
  legendary: {
    edge: ['#fde68a', '#92400e', '#fffbeb', '#b45309', '#fcd34d'],
    badgeBg: '#b45309',
    badgeText: '#fffbeb',
    glow: 'rgba(251,191,36,0.6)',
    foil: 0.3,
  },
  'ultra elite': {
    edge: ['#f0abfc', '#a5b4fc', '#67e8f9', '#ffffff', '#fde68a', '#fca5a5', '#c4b5fd'],
    badgeBg: '#c084fc',
    badgeText: '#0b0b12',
    glow: 'rgba(192,132,252,0.65)',
    foil: 0.42,
  },
  'after hours': {
    edge: ['#0a0a0d', '#2a2338', '#3d2f4a', '#2f4550', '#6b6470', '#2f4550', '#14121c', '#0a0a0d'],
    badgeBg: 'rgba(8,8,11,0.9)',
    badgeText: '#d8d2e0',
    glow: 'rgba(160,150,175,0.4)',
    foil: 0.12,
  },
}

const paletteOf = (r) => RARITY_PALETTE[r] || RARITY_PALETTE.common

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// draw art cropped to fill (object-cover behaviour)
const drawCover = (ctx, img, x, y, w, h) => {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

const wrapText = (ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) => {
  const words = String(text).split(' ')
  let line = ''
  let lines = 0
  let cursorY = y

  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = words[i]
      cursorY += lineHeight
      lines++
      if (lines >= maxLines) return cursorY
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY)
    cursorY += lineHeight
  }
  return cursorY
}

const drawEdge = (ctx, x, y, w, h, pal) => {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  const stops = pal.edge
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
  ctx.fillStyle = g
  roundRect(ctx, x, y, w, h, 44)
  ctx.fill()
}

const drawFoil = (ctx, x, y, w, h, strength) => {
  if (!strength) return
  ctx.save()
  roundRect(ctx, x, y, w, h, 34)
  ctx.clip()
  ctx.globalCompositeOperation = 'screen'

  const g = ctx.createLinearGradient(x, y + h, x + w, y)
  g.addColorStop(0.0, 'rgba(255,255,255,0)')
  g.addColorStop(0.38, `rgba(255,235,180,${strength * 0.35})`)
  g.addColorStop(0.47, `rgba(255,255,255,${strength})`)
  g.addColorStop(0.53, `rgba(255,220,140,${strength * 0.8})`)
  g.addColorStop(0.60, `rgba(180,240,255,${strength * 0.6})`)
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  ctx.restore()
}

const drawBadge = (ctx, text, x, y, pal) => {
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif'
  const label = String(text).toUpperCase()
  const tw = ctx.measureText(label).width
  const padX = 26
  const bw = tw + padX * 2
  const bh = 54

  ctx.save()
  ctx.fillStyle = pal.badgeBg
  roundRect(ctx, x - bw, y, bw, bh, 27)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  roundRect(ctx, x - bw, y, bw, bh, 27)
  ctx.stroke()

  ctx.fillStyle = pal.badgeText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x - bw / 2, y + bh / 2 + 1)
  ctx.restore()
}

const STATLESS = ['after hours']

const normalizeStats = (card) => {
  if (STATLESS.includes(String(card.rarity || '').toLowerCase())) return []
  if (Array.isArray(card.stats) && card.stats.length) return card.stats
  const legacy = []
  if (card.hp != null) legacy.push({ label: 'HP', value: card.hp })
  if (card.attack != null) legacy.push({ label: 'ATK', value: card.attack })
  if (card.defense != null) legacy.push({ label: 'DEF', value: card.defense })
  if (card.speed != null) legacy.push({ label: 'SPD', value: card.speed })
  return legacy
}

const drawFront = async (ctx, card, ox, oy) => {
  const pal = paletteOf(card.rarity)
  const B = 14 // border thickness

  drawEdge(ctx, ox, oy, CARD_W, CARD_H, pal)

  const ix = ox + B
  const iy = oy + B
  const iw = CARD_W - B * 2
  const ih = CARD_H - B * 2

  ctx.save()
  roundRect(ctx, ix, iy, iw, ih, 34)
  ctx.clip()

  ctx.fillStyle = '#08080b'
  ctx.fillRect(ix, iy, iw, ih)

  if (card.image_url) {
    try {
      const img = await loadImage(card.image_url)
      drawCover(ctx, img, ix, iy, iw, ih)
    } catch (e) {
      // leave dark background
    }
  }

  // nameplate gradient
  const plateH = 260
  const py = iy + ih - plateH
  const pg = ctx.createLinearGradient(0, py, 0, iy + ih)
  pg.addColorStop(0, 'rgba(6,6,10,0)')
  pg.addColorStop(0.45, 'rgba(6,6,10,0.72)')
  pg.addColorStop(1, 'rgba(6,6,10,0.96)')
  ctx.fillStyle = pg
  ctx.fillRect(ix, py, iw, plateH)

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ix, py + 90)
  ctx.lineTo(ix + iw, py + 90)
  ctx.stroke()

  ctx.restore()

  drawFoil(ctx, ix, iy, iw, ih, pal.foil)

  // name + title
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 78px system-ui, -apple-system, sans-serif'
  const name = card.name || 'Unnamed'
  ctx.fillText(name, ix + 48, iy + ih - 110, iw - 96)

  if (card.title) {
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '600 34px system-ui, -apple-system, sans-serif'
    ctx.fillText(String(card.title).toUpperCase(), ix + 48, iy + ih - 56, iw - 96)
  }
  ctx.restore()

  drawBadge(ctx, card.rarity, ix + iw - 36, iy + 36, pal)
}

const drawBack = async (ctx, card, ox, oy) => {
  const pal = paletteOf(card.rarity)
  const B = 14

  drawEdge(ctx, ox, oy, CARD_W, CARD_H, pal)

  const ix = ox + B
  const iy = oy + B
  const iw = CARD_W - B * 2
  const ih = CARD_H - B * 2

  ctx.save()
  roundRect(ctx, ix, iy, iw, ih, 34)
  ctx.clip()

  ctx.fillStyle = '#08080b'
  ctx.fillRect(ix, iy, iw, ih)

  if (card.back_image_url) {
    try {
      const img = await loadImage(card.back_image_url)
      drawCover(ctx, img, ix, iy, iw, ih)
    } catch (e) {}
  }

  // dark scrim so text reads
  const scrimTop = iy + ih * 0.42
  const scrimH = ih * 0.58
  const sg = ctx.createLinearGradient(0, scrimTop, 0, iy + ih)
  sg.addColorStop(0, 'rgba(0,0,0,0)')
  sg.addColorStop(0.35, 'rgba(0,0,0,0.70)')
  sg.addColorStop(1, 'rgba(0,0,0,0.96)')
  ctx.fillStyle = sg
  ctx.fillRect(ix, scrimTop, iw, scrimH)

  ctx.restore()

  drawFoil(ctx, ix, iy, iw, ih, pal.foil)

  // content
  const stats = normalizeStats(card)
  const left = ix + 56
  const maxW = iw - 112

  // measure from bottom up
  const footerY = iy + ih - 70
  const statH = 60
  const statsBlockH = stats.length * statH
  let cursor = footerY - 46 - statsBlockH - 30

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // flavor text (above stats)
  if (card.flavor_text) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'italic 34px system-ui, -apple-system, sans-serif'
    const flavorTop = cursor - 10
    wrapText(ctx, `"${card.flavor_text}"`, left, flavorTop, maxW, 44, 2)
    cursor = flavorTop - 44
  }

  // description (above flavor)
  if (card.description) {
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '38px system-ui, -apple-system, sans-serif'
    // draw upward: estimate lines then place
    const words = String(card.description).split(' ')
    let lines = 1
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (ctx.measureText(test).width > maxW && line) {
        lines++
        line = w
      } else {
        line = test
      }
    }
    const blockH = lines * 50
    const startY = cursor - blockH + 40
    wrapText(ctx, card.description, left, startY, maxW, 50, 5)
  }

  // stats
  let sy = footerY - 46 - statsBlockH + 34
  for (const s of stats) {
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 30px system-ui, -apple-system, sans-serif'
    ctx.fillText(String(s.label || '').toUpperCase(), left, sy)

    const barX = left + 300
    const barW = maxW - 300 - 90
    const val = Math.max(0, Math.min(100, Number(s.value) || 0))

    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    roundRect(ctx, barX, sy - 16, barW, 12, 6)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    roundRect(ctx, barX, sy - 16, (barW * val) / 100, 12, 6)
    ctx.fill()

    ctx.fillStyle = '#f1f5f9'
    ctx.font = '600 30px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(String(val), ix + iw - 56, sy)
    ctx.textAlign = 'left'

    sy += statH
  }

  // footer rule
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, footerY - 30)
  ctx.lineTo(ix + iw - 56, footerY - 30)
  ctx.stroke()

  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 28px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(card.card_number || '—', left, footerY + 8)

  ctx.fillStyle = '#64748b'
  ctx.font = '600 26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('COMPANION', ix + iw - 56, footerY + 8)
  ctx.restore()

  drawBadge(ctx, card.rarity, ix + iw - 36, iy + 36, pal)
}

export async function downloadCard(card) {
  const pal = paletteOf(card.rarity)

  const canvas = document.createElement('canvas')
  canvas.width = PAD * 2 + CARD_W * 2 + GAP
  canvas.height = PAD * 2 + CARD_H
  const ctx = canvas.getContext('2d')

  // backdrop
  ctx.fillStyle = '#05050a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // rarity glow behind cards
  if (pal.glow) {
    ctx.save()
    ctx.shadowColor = pal.glow
    ctx.shadowBlur = 90
    ctx.fillStyle = 'rgba(0,0,0,0.01)'
    roundRect(ctx, PAD, PAD, CARD_W, CARD_H, 44)
    ctx.fill()
    roundRect(ctx, PAD + CARD_W + GAP, PAD, CARD_W, CARD_H, 44)
    ctx.fill()
    ctx.restore()
  }

  await drawFront(ctx, card, PAD, PAD)
  await drawBack(ctx, card, PAD + CARD_W + GAP, PAD)

  const safeName = String(card.name || 'card').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  const fileName = `${card.card_number || 'card'}_${safeName}.png`

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      resolve()
    }, 'image/png')
  })
}
