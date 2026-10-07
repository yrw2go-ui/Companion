// lib/appConfig.js
import { supabase } from './supabaseClient'

export const DEFAULT_APP_CONFIG = {
  prompts: {
    negative: 'blurry, (Asian), mature woman, big hips, wide hips, big breasts, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame',
    stylizedNegative: 'photorealistic, photo, real human, realistic skin pores, DSLR photo, 8k photo, hyperrealistic, uncanny valley',
    cardFrontHint: 'Character in the upper two thirds, empty space below for the name.',
    cardBackHint: 'Same character, same features, card back scene.',
  },
  tabs: {
    home: 'Home',
    packs: 'FREEBIES',
    shop: 'Shop',
    collection: 'My Collection',
    shows: 'Shows',
    freebiesBody: 'Random Freebies (while supplies last). Continue to check regularly for miscellaneous free stuff.',
    shopHeading: 'Card Character Media',
  },
  editions: {
    common: 2000,
    uncommon: 1000,
    rare: 500,
    epic: 350,
    legendary: 250,
    'ultra elite': 150,
    'after hours': 50,
    mint: 1,
  },
  prices: {
    mysteryLow: 200,
    mysteryMid: 500,
    mysteryHigh: 800,
    mediaSingle: 400,
    mediaMulti: 1100,
    mediaMultiQty: 3,
    miscSingle: 200,
    miscMulti: 500,
    miscSet: 700,
    videoUnlock: 100,
    buyback: {
      common: 25,
      uncommon: 50,
      rare: 100,
      epic: 150,
      legendary: 200,
      'ultra elite': 250,
      'after hours': 500,
      media: 100,
      misc: 50,
    },
  },
  artStyles: [
    { label: 'None (use prompt as-is)', prompt: '' },
    { label: 'Fortnite Style (non-realistic)', prompt: 'Fortnite style 3D character render, Epic Games Fortnite aesthetic, stylized cartoony proportions, clean cel-shaded look, bold outlines, vibrant saturated colors, simplified facial features, game character art, not photorealistic, not realistic skin, Unreal Engine game render style' },
    { label: 'Stylized 3D Game Character', prompt: 'stylized 3D game character, anime-influenced proportions, smooth plastic skin shader, bright saturated palette, clean game-ready render, not photorealistic' },
    { label: 'Anime Illustration', prompt: 'anime illustration, clean line art, cel shading, vibrant colors, detailed eyes, not photorealistic, 2D anime style' },
    { label: 'Comic Book', prompt: 'comic book illustration, bold ink outlines, flat color fills, dynamic pose, graphic novel style, not photorealistic' },
    { label: 'Editorial Fashion', prompt: 'editorial fashion photography, professional studio lighting, sharp focus, natural skin texture, high end magazine quality' },
    { label: 'Natural Light Portrait', prompt: 'natural light portrait photography, soft window light, shallow depth of field, candid feel, realistic skin' },
    { label: 'Sports Action', prompt: 'sports photography, fast shutter, dynamic action, stadium or track setting, crisp detail, athletic' },
    { label: 'Black & White', prompt: 'black and white photography, high contrast monochrome, dramatic shadows, classic film grain' },
    { label: 'Golden Hour', prompt: 'golden hour photography, warm backlight, sun flare, glowing rim light, outdoor' },
    { label: 'Street Style', prompt: 'street style photography, urban backdrop, candid stride, city environment, documentary feel' },
    { label: 'Studio Beauty', prompt: 'studio beauty photography, clean seamless backdrop, soft even lighting, crisp detail, minimal' },
    { label: 'Cinematic', prompt: 'cinematic film still, anamorphic look, moody colour grade, shallow focus, narrative feel' },
    { label: 'Film Photography', prompt: 'analog film photography, 35mm grain, muted colour, slight halation, nostalgic tone' },
    { label: 'Runway', prompt: 'high fashion runway photography, backstage energy, motion, professional lighting' },
  ],
  promptExtras: [
    { id: 'skin', label: 'Skin', options: [
      { id: 'fair', label: 'Fair', text: 'fair light skin' },
      { id: 'porcelain', label: 'Porcelain', text: 'porcelain pale skin' },
      { id: 'olive', label: 'Olive', text: 'olive skin tone' },
      { id: 'deep_brown', label: 'Deep brown', text: 'deep rich brown skin' },
    ]},
    { id: 'hair_color', label: 'Hair color', options: [
      { id: 'blonde', label: 'Blonde', text: 'blonde hair' },
      { id: 'brunette', label: 'Brunette', text: 'brunette brown hair' },
      { id: 'black', label: 'Black', text: 'jet black hair' },
      { id: 'red', label: 'Red', text: 'red hair' },
    ]},
  ],
}

export function mergeConfig(saved) {
  const base = JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG))
  const src = saved && typeof saved === 'object' ? saved : {}
  return {
    ...base,
    ...src,
    prompts: { ...base.prompts, ...(src.prompts || {}) },
    tabs: { ...base.tabs, ...(src.tabs || {}) },
    editions: { ...base.editions, ...(src.editions || {}) },
    prices: {
      ...base.prices,
      ...(src.prices || {}),
      buyback: { ...base.prices.buyback, ...((src.prices && src.prices.buyback) || {}) },
    },
    artStyles: Array.isArray(src.artStyles) && src.artStyles.length ? src.artStyles : base.artStyles,
    promptExtras: Array.isArray(src.promptExtras) && src.promptExtras.length ? src.promptExtras : base.promptExtras,
  }
}

export async function loadAppConfig() {
  const { data, error } = await supabase.from('app_config').select('data').eq('id', 1).maybeSingle()
  if (error) return { config: mergeConfig(null), error }
  return { config: mergeConfig(data?.data), error: null }
}

export async function saveAppConfig(config) {
  return supabase.from('app_config').upsert({ id: 1, data: config, updated_at: new Date().toISOString() })
}
