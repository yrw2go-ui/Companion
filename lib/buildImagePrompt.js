// lib/buildImagePrompt.js
export function buildImagePrompt(character, sceneContext = '', includeUser = false, userDescription = '') {
  const parts = []

  // character appearance
  if (character.appearance) {
    parts.push(`${character.name}: ${character.appearance}`)
  } else {
    parts.push(character.name)
  }

  // include the user if this is an "us together" image
  if (includeUser && userDescription) {
    parts.push(`with another person: ${userDescription}`)
    parts.push('two people together in the scene')
  }

  // scene context from conversation
  if (sceneContext) {
    parts.push(sceneContext)
  }

  // style preset
  if (character.image_style) {
    parts.push(character.image_style)
  } else {
    parts.push('high quality, detailed, cinematic lighting')
  }

  return parts.join(', ')
}
