import {
  bigrams,
  diceCoefficient,
  levenshteinSimilarity,
  nameVariants,
  ocrTextVariants,
} from './normalize'
import type { CatalogItem, MatchCandidate } from '../types'

interface IndexEntry {
  key: string
  weight: number
  grams: Set<string>
  item: CatalogItem
}

export interface MatchIndex {
  readonly size: number
  readonly items: CatalogItem[]
  search(text: string, limit?: number): MatchCandidate[]
  bySlug(slug: string): CatalogItem | undefined
}

const DICE_PREFILTER = 0.3

function keepBest(target: Map<string, MatchCandidate>, item: CatalogItem, score: number): void {
  const clamped = Math.min(1, Math.max(0, score))
  const existing = target.get(item.id)
  if (!existing || existing.score < clamped) target.set(item.id, { item, score: clamped })
}

export function buildMatchIndex(items: CatalogItem[]): MatchIndex {
  const byKey = new Map<string, IndexEntry>()
  const bySlug = new Map<string, CatalogItem>()

  const register = (item: CatalogItem, rawName: string | null) => {
    if (!rawName) return
    for (const variant of nameVariants(rawName)) {
      const existing = byKey.get(variant.key)
      if (existing && existing.weight >= variant.weight) continue
      byKey.set(variant.key, {
        key: variant.key,
        weight: variant.weight,
        grams: bigrams(variant.key),
        item,
      })
    }
  }

  for (const item of items) {
    bySlug.set(item.slug, item)
    register(item, item.nameZh)
    register(item, item.nameEn)
  }

  const entries = [...byKey.values()]

  const search = (text: string, limit = 5): MatchCandidate[] => {
    const variants = ocrTextVariants(text)
    if (variants.length === 0) return []

    const best = new Map<string, MatchCandidate>()

    for (const variant of variants) {
      const hit = byKey.get(variant.key)
      if (hit) keepBest(best, hit.item, variant.weight * hit.weight)
    }

    const primary = variants.reduce((a, b) => (b.key.length > a.key.length ? b : a))
    const primaryGrams = bigrams(primary.key)
    const maxLengthDelta = Math.max(4, primary.key.length * 0.7)

    for (const entry of entries) {
      if (entry.key === primary.key) continue
      if (Math.abs(entry.key.length - primary.key.length) > maxLengthDelta) continue
      const dice = diceCoefficient(primaryGrams, entry.grams)
      if (dice < DICE_PREFILTER) continue
      const score =
        Math.max(levenshteinSimilarity(primary.key, entry.key), dice) * entry.weight * primary.weight
      keepBest(best, entry.item, score)
    }

    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
  }

  return { size: items.length, items, search, bySlug: (slug) => bySlug.get(slug) }
}
