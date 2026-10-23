import type { WeaponResolution } from '../types'
import type { MatchIndex } from './match'
import { levenshteinSimilarity, normalizeName } from './normalize'

const HAN = /[\p{Script=Han}\u3000-\u303f]+/gu
const LATIN = /[A-Za-z][A-Za-z-]*/g

/** 把「武器名 + 裂罅名」混在一行的文本切成可能藏武器名的片段。 */
export function weaponTextCandidates(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const candidates = new Set<string>([trimmed])

  const han = (trimmed.match(HAN) ?? []).join(' ').trim()
  if (han.length >= 2) candidates.add(han)

  const latin = (trimmed.match(LATIN) ?? []).join(' ').trim()
  if (latin.length >= 3) candidates.add(latin)

  return [...candidates]
}

export interface ResolveWeaponOptions {
  autoThreshold: number
  suggestThreshold: number
  limit?: number
  fallbackFloor?: number
}

// 汉字武器名常只有 2-4 个字，错一个字整串就匹配不上（bigram 在 2 字名上只有一个 gram）。
// 所以主匹配失败后再按「字符重叠 + 编辑距离」补一轮候选，交给用户点选。
const DEFAULT_FALLBACK_FLOOR = 0.34

function characterFallback(
  rawName: string,
  index: MatchIndex,
  limit: number,
  floor: number,
): WeaponResolution[] {
  const candidates = weaponTextCandidates(rawName)
  const query =
    candidates
      .map(normalizeName)
      .filter((value) => value.length >= 2)
      .sort((a, b) => b.length - a.length)[0] ?? ''
  if (query.length < 2) return []

  const queryChars = new Set(query)
  const best = new Map<string, WeaponResolution>()

  for (const item of index.items) {
    let top = 0
    for (const name of [item.nameZh, item.nameEn]) {
      const key = normalizeName(name)
      if (!key) continue
      if (Math.abs(key.length - query.length) > 2) continue

      const chars = new Set(key)
      let overlap = 0
      for (const character of queryChars) {
        if (chars.has(character)) overlap += 1
      }
      const union = queryChars.size + chars.size - overlap
      const jaccard = union > 0 ? overlap / union : 0
      top = Math.max(top, jaccard, levenshteinSimilarity(query, key))
    }
    if (top < floor) continue
    best.set(item.slug, {
      slug: item.slug,
      nameZh: item.nameZh,
      nameEn: item.nameEn,
      score: top,
      certain: false,
    })
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

export function resolveWeapons(
  rawName: string,
  index: MatchIndex,
  options: ResolveWeaponOptions,
): WeaponResolution[] {
  const trimmed = rawName.trim()
  if (!trimmed) return []

  const best = new Map<string, WeaponResolution>()

  for (const candidate of weaponTextCandidates(trimmed)) {
    for (const hit of index.search(candidate, options.limit ?? 8)) {
      const existing = best.get(hit.item.slug)
      if (existing && existing.score >= hit.score) continue
      best.set(hit.item.slug, {
        slug: hit.item.slug,
        nameZh: hit.item.nameZh,
        nameEn: hit.item.nameEn,
        score: hit.score,
        certain: hit.score >= options.autoThreshold,
      })
    }
  }

  const primary = [...best.values()]
    .filter((entry) => entry.score >= options.suggestThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 8)

  if (primary.length > 0) return primary

  return characterFallback(
    trimmed,
    index,
    options.limit ?? 8,
    options.fallbackFloor ?? DEFAULT_FALLBACK_FLOOR,
  )
}

/** 从裂罅名反解正面词条 slot；读不出名字时退回卡面词条文本。 */
export function decodePositiveSlugs(
  riven: { rivenName: string; positiveTexts: string[] },
  vocabulary: { read(text: string): { tokens: { attribute: { slug: string } }[] } | null },
  attributeSlugByName: Map<string, string>,
): string[] {
  const reading = riven.rivenName ? vocabulary.read(riven.rivenName) : null
  if (reading && reading.tokens.length > 0) {
    return [...new Set(reading.tokens.map((token) => token.attribute.slug))]
  }

  return [
    ...new Set(
      riven.positiveTexts
        .map((text) => attributeSlugByName.get(normalizeName(text)))
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ]
}
