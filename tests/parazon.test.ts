import { describe, expect, it } from 'vitest'
import {
  filterParazonItems,
  groupParazonItems,
  REQUIEM_SLUGS,
  VALENCE_SLUGS,
} from '../src/lib/parazon'
import type { CatalogItem } from '../src/types'

function item(slug: string, nameZh: string, nameEn: string, tags: string[] = ['mod', 'parazon']): CatalogItem {
  return { id: slug, slug, nameZh, nameEn, thumb: 'thumb.png', tags, maxRank: 5 }
}

const VALENCE_NAMES: Record<string, string> = {
  byteryte: '字节卫士',
  keep_clean: '持续清理',
  trojan_tracker: '木马追缉',
  computer_cop: '电脑巡警',
  worm_away: '蠕虫驱逐',
  soft_safe: '软件安全',
  anti_v: '防毒先锋',
  drive_duster: '驱动除尘',
}

const ITEMS: CatalogItem[] = [
  ...REQUIEM_SLUGS.map((slug) => item(slug, slug.toUpperCase(), slug.toUpperCase())),
  ...VALENCE_SLUGS.map((slug) => item(slug, VALENCE_NAMES[slug], slug)),
  ...Array.from({ length: 23 }, (_, index) => item(`other_${index}`, `其它${index}`, `Other ${index}`)),
  item('split_chamber', '分裂膛室', 'Split Chamber', ['mod', 'rare']),
  item('formite', 'Forma', 'Forma', ['resource']),
]

describe('groupParazonItems', () => {
  const groups = groupParazonItems(ITEMS)

  it('splits parazon items into requiem / valence / others', () => {
    expect(groups.requiem).toHaveLength(8)
    expect(groups.valence).toHaveLength(8)
    expect(groups.others).toHaveLength(23)
  })

  it('ignores items without the parazon tag', () => {
    const slugs = [...groups.requiem, ...groups.valence, ...groups.others].map((entry) => entry.slug)
    expect(slugs).not.toContain('split_chamber')
    expect(slugs).not.toContain('formite')
  })

  it('puts requiem slugs in the requiem group', () => {
    expect(groups.requiem.map((entry) => entry.slug).sort()).toEqual([...REQUIEM_SLUGS].sort())
  })
})

describe('filterParazonItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterParazonItems(ITEMS, '')).toHaveLength(39)
  })

  it('matches a Chinese name', () => {
    const hits = filterParazonItems(ITEMS, '字节')
    expect(hits.map((entry) => entry.slug)).toContain('byteryte')
  })

  it('matches an English requiem name case-insensitively', () => {
    const hits = filterParazonItems(ITEMS, 'FASS')
    expect(hits.map((entry) => entry.slug)).toEqual(['fass'])
  })

  it('matches a slug fragment', () => {
    expect(filterParazonItems(ITEMS, 'worm').map((entry) => entry.slug)).toEqual(['worm_away'])
  })

  it('returns nothing for unmatched queries', () => {
    expect(filterParazonItems(ITEMS, 'zzzzzz')).toEqual([])
  })
})
