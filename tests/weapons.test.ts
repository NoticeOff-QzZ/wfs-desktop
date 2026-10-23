import { describe, expect, it } from 'vitest'
import { buildMatchIndex } from '../src/lib/match'
import { resolveWeapons, weaponTextCandidates } from '../src/lib/weapons'
import type { CatalogItem } from '../src/types'

function weapon(slug: string, nameZh: string, nameEn: string): CatalogItem {
  return { id: slug, slug, nameZh, nameEn, thumb: null, tags: ['riven-weapon'], maxRank: 0 }
}

const index = buildMatchIndex([
  weapon('war', '战争之剑', 'War'),
  weapon('verglas', '冰凇', 'Verglas'),
  weapon('sibear', '西伯利亚冰锤', 'Sibear'),
])

const options = { autoThreshold: 0.86, suggestThreshold: 0.6, limit: 6 }

describe('weaponTextCandidates', () => {
  it('splits a weapon + riven line', () => {
    const candidates = weaponTextCandidates('战争之剑 Decius')
    expect(candidates).toContain('战争之剑')
    expect(candidates).toContain('Decius')
  })
})

describe('resolveWeapons', () => {
  it('matches the Chinese part exactly', () => {
    const results = resolveWeapons('战争之剑 Decius', index, options)
    expect(results[0]?.slug).toBe('war')
    expect(results[0]?.certain).toBe(true)
  })

  it('offers a character-level candidate when one character is misread', () => {
    const results = resolveWeapons('冰松', index, options)
    expect(results[0]?.slug).toBe('verglas')
    expect(results[0]?.certain).toBe(false)
  })

  it('returns nothing for unrelated text', () => {
    expect(resolveWeapons('zzzzzz', index, options)).toEqual([])
  })

  it('returns nothing for empty input', () => {
    expect(resolveWeapons('   ', index, options)).toEqual([])
  })
})
