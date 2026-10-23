import { describe, expect, it } from 'vitest'
import { resolveItemRank } from '../src/lib/rank'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import type { AppSettings, CatalogItem } from '../src/types'

function item(tags: string[], maxRank: number): CatalogItem {
  return { id: 'x', slug: 'x', nameZh: 'X', nameEn: 'X', thumb: null, tags, maxRank }
}

describe('resolveItemRank', () => {
  it('queries rank 0 for mods by default', () => {
    expect(resolveItemRank(item(['mod', 'rare'], 5), DEFAULT_SETTINGS)).toBe(0)
    expect(resolveItemRank(item(['mod', 'legendary'], 10), DEFAULT_SETTINGS)).toBe(0)
  })

  it('queries max rank for arcanes by default', () => {
    expect(resolveItemRank(item(['common', 'arcane_enhancement'], 5), DEFAULT_SETTINGS)).toBe(5)
  })

  it('honours configured ranks', () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, modRank: 5, arcaneRank: 3 }
    expect(resolveItemRank(item(['mod'], 10), settings)).toBe(5)
    expect(resolveItemRank(item(['arcane_enhancement'], 5), settings)).toBe(3)
  })

  it('clamps configured ranks to the item maximum', () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, modRank: 99 }
    expect(resolveItemRank(item(['mod'], 5), settings)).toBe(5)
  })

  it('returns 0 for items that cannot be ranked', () => {
    expect(resolveItemRank(item(['resource'], 0), DEFAULT_SETTINGS)).toBe(0)
  })
})
