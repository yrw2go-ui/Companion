// lib/buildImagePrompt.js
export function buildImagePrompt(character, sceneContext = '') {
  const parts = []

  if (character.appearance) {
    parts.push(character.appearance)
  } else {
    parts.push(character.name)
  }

  if (sceneContext) {
    parts.push(sceneContext)
  }

  if (character.image_style) {
    parts.push(character.image_style)
  } else {
    parts.push('high quality, detailed, cinematic lighting')
  }

  return parts.join(', ')
}
