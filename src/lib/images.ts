import { supabase } from './supabase'

export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

function sanitizeImageName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-]+$/g, '')
  return clean || 'image'
}

// Upload keeping a readable filename so notes read like Obsidian:
// ![[sampling-diagram.png]]. On a name collision, add a short suffix.
export async function uploadImage(file: File): Promise<string> {
  let name = sanitizeImageName(file.name || 'pasted-image.png')
  if (!IMAGE_EXT_RE.test(name)) name += '.png'
  const contentType = file.type || 'image/png'

  const { error } = await supabase.storage.from('screenshots').upload(name, file, { contentType })
  if (error) {
    const dot = name.lastIndexOf('.')
    name = `${name.slice(0, dot)}-${Date.now().toString(36)}${name.slice(dot)}`
    const retry = await supabase.storage.from('screenshots').upload(name, file, { contentType })
    if (retry.error) throw new Error(retry.error.message)
  }
  return name
}

export function imageFiles(list: Iterable<File>): File[] {
  return Array.from(list).filter((f) => f.type.startsWith('image/'))
}
