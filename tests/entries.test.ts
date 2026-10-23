import { describe, expect, it } from 'vitest'
import { addManualItem, addManualItems, buildItemEntries } from '../src/lib/entries'
import { buildMatchIndex } from '../src/lib/match'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import type { CatalogItem, VisionItem } from '../src/types'

function catalogItem(
  id: string,
  nameZh: string,
  nameEn: string,
  tags: string[] = ['mod'],
  maxRank = 5,
): CatalogItem {
  return { id, slug: id, nameZh, nameEn, thumb: null, tags, maxRank }
}

const catalog = [
  catalogItem('split_chamber', '分裂膛室', 'Split Chamber'),
  catalogItem('fever_strike', '热病打击', 'Fever Strike'),
]
const index = buildMatchIndex(catalog)

function visionItem(name: string, count = 1): VisionItem {
  return { name, count, confidence: 'high' }
}

describe('buildItemEntries', () => {
  it('merges duplicate items and sums their counts', () => {
    const result = buildItemEntries(
      [visionItem('分裂膛室', 2), visionItem('分裂膛室', 3)],
      index,
      DEFAULT_SETTINGS,
    )

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.item.slug).toBe('split_chamber')
    expect(result.entries[0]?.count).toBe(5)
    expect(result.unresolved).toEqual([])
  })

  it('keeps unmatched names for the UI notice', () => {
    const result = buildItemEntries([visionItem('完全不存在的物品')], index, DEFAULT_SETTINGS)
    expect(result.entries).toEqual([])
    expect(result.unresolved).toEqual(['完全不存在的物品'])
  })
})

describe('addManualItem', () => {
  it('adds a new card for the first click', () => {
    const result = addManualItem([], catalog[0], DEFAULT_SETTINGS)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.count).toBe(1)
    expect(result.created?.item.slug).toBe('split_chamber')
  })

  it('increments the count instead of creating a duplicate card', () => {
    const first = addManualItem([], catalog[0], DEFAULT_SETTINGS)
    const second = addManualItem(first.entries, catalog[0], DEFAULT_SETTINGS)

    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]?.count).toBe(2)
    expect(second.created).toBeNull()
  })

  it('keeps every selection when adding a batch', () => {
    const results = addManualItems([], catalog, DEFAULT_SETTINGS)
    const entries = results.at(-1)?.entries ?? []

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.item.slug)).toEqual(['split_chamber', 'fever_strike'])
  })
})
