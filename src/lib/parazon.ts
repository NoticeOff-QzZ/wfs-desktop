import type { CatalogItem } from '../types'
import { itemDisplayName } from '../types'
import { normalizeName } from './normalize'

/** 8 张安魂 MOD。 */
export const REQUIEM_SLUGS = [
  'fass',
  'lohk',
  'ris',
  'jahu',
  'netra',
  'vome',
  'khra',
  'xata',
] as const

/** 8 张效价 / 1999 帕拉松 MOD。 */
export const VALENCE_SLUGS = [
  'byteryte',
  'keep_clean',
  'trojan_tracker',
  'computer_cop',
  'worm_away',
  'soft_safe',
  'anti_v',
  'drive_duster',
] as const

export interface ParazonGroups {
  requiem: CatalogItem[]
  valence: CatalogItem[]
  others: CatalogItem[]
}

function byName(a: CatalogItem, b: CatalogItem): number {
  return itemDisplayName(a).localeCompare(itemDisplayName(b), 'zh-CN')
}

/**
 * 帕拉松卡按三类分组。
 *
 * 安魂与效价卡面经常只有图案没有文字，识别不可靠，所以界面把它们做成可点选的候选。
 */
export function groupParazonItems(items: CatalogItem[]): ParazonGroups {
  const requiemSet = new Set<string>(REQUIEM_SLUGS)
  const valenceSet = new Set<string>(VALENCE_SLUGS)
  const groups: ParazonGroups = { requiem: [], valence: [], others: [] }

  for (const item of items) {
    if (!item.tags.includes('parazon')) continue
    if (requiemSet.has(item.slug)) groups.requiem.push(item)
    else if (valenceSet.has(item.slug)) groups.valence.push(item)
    else groups.others.push(item)
  }

  groups.requiem.sort(byName)
  groups.valence.sort(byName)
  groups.others.sort(byName)
  return groups
}

/** 按中英文名或 slug 过滤候选。 */
export function filterParazonItems(items: CatalogItem[], query: string): CatalogItem[] {
  const needle = normalizeName(query)
  const lowered = query.trim().toLowerCase()
  return items.filter((item) => {
    if (!item.tags.includes('parazon')) return false
    if (!needle) return true
    const haystack = `${item.nameZh ?? ''} ${item.nameEn ?? ''} ${item.slug}`.toLowerCase()
    return haystack.includes(lowered) || normalizeName(haystack).includes(needle)
  })
}
