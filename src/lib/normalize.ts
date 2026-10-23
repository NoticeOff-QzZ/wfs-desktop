import { distance } from 'fastest-levenshtein'

const NON_WORD = /[^\p{L}\p{N}]/gu

export function normalizeName(input: string | null | undefined): string {
  if (!input) return ''
  return input.normalize('NFKC').toLowerCase().replace(NON_WORD, '')
}

export interface Variant {
  key: string
  weight: number
}

const SET_MARKERS = ['一套', '全套', 'set', 'fullset', 'bundle']
const BLUEPRINT_MARKERS = ['蓝图', 'blueprint', '总图']

function stripTrailingMarker(normalized: string, markers: string[]): string | null {
  for (const marker of markers) {
    if (normalized.length > marker.length && normalized.endsWith(marker)) {
      return normalized.slice(0, normalized.length - marker.length)
    }
  }
  return null
}

function dedupe(variants: Variant[]): Variant[] {
  const best = new Map<string, Variant>()
  for (const variant of variants) {
    if (!variant.key) continue
    const existing = best.get(variant.key)
    if (!existing || existing.weight < variant.weight) best.set(variant.key, variant)
  }
  return [...best.values()]
}

export function nameVariants(rawName: string | null | undefined): Variant[] {
  const base = normalizeName(rawName)
  if (!base) return []
  const variants: Variant[] = [{ key: base, weight: 1 }]

  const withoutSet = stripTrailingMarker(base, SET_MARKERS)
  if (withoutSet) variants.push({ key: withoutSet, weight: 0.97 })

  const withoutBlueprint = stripTrailingMarker(base, BLUEPRINT_MARKERS)
  if (withoutBlueprint) variants.push({ key: withoutBlueprint, weight: 0.95 })

  return dedupe(variants)
}

const TRAILING_COUNTER = /(?:[x×*]\s*\d{1,4}|\d{1,4}\s*[x×]|\d{1,4})$/u

export function ocrTextVariants(rawText: string): Variant[] {
  const cleaned = rawText.replace(/\s+/g, ' ').trim()
  const variants: Variant[] = []

  const base = normalizeName(cleaned)
  if (base) variants.push({ key: base, weight: 1 })

  const withoutCounter = cleaned.replace(TRAILING_COUNTER, '').trim()
  if (withoutCounter && withoutCounter !== cleaned) {
    for (const variant of nameVariants(withoutCounter)) {
      variants.push({ key: variant.key, weight: variant.weight * 0.99 })
    }
  }

  return dedupe(variants)
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const longest = Math.max(a.length, b.length)
  return 1 - distance(a, b) / longest
}

export function bigrams(value: string): Set<string> {
  const grams = new Set<string>()
  if (!value) return grams
  if (value.length <= 2) {
    grams.add(value)
    return grams
  }
  for (let i = 0; i < value.length - 1; i += 1) {
    grams.add(value.slice(i, i + 2))
  }
  return grams
}

export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let overlap = 0
  for (const gram of small) {
    if (large.has(gram)) overlap += 1
  }
  return (2 * overlap) / (a.size + b.size)
}
