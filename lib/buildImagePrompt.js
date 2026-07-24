// lib/buildImagePrompt.js
// Builds a clean image prompt from the character's fixed appearance plus a few
// current scene parameters (location, outfit, mood) rather than raw dialogue.
export function buildImagePrompt(character, scene = {}, includeUser = false, userDescription = '') {
  const parts = []

  // character appearance (the stable anchor)
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

  // current scene parameters, only if present
  const { location = '', outfit = '', mood = '' } = scene || {}
  if (outfit) parts.push(`wearing ${outfit}`)
  if (location) parts.push(`location: ${location}`)
  if (mood) parts.push(`mood: ${mood}`)

  // style preset
  if (character.image_style) {
    parts.push(character.image_style)
  } else {
    parts.push('high quality, detailed, cinematic lighting')
  }

  return parts.join(', ')
}
