import type { UploadedImage } from '../types'

export const MAX_IMAGES = 3

export function reorderImages(
  images: UploadedImage[],
  from: number,
  to: number,
): UploadedImage[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= images.length ||
    to >= images.length
  ) {
    return images
  }

  const next = [...images]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
