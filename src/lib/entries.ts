import type { AppSettings, CatalogItem, ItemEntry, VisionItem } from '../types'
import type { MatchIndex } from './match'
import { resolveItemRank } from './rank'

export const SUGGEST_THRESHOLD = 0.6
export const AUTO_THRESHOLD = 0.86

export interface BuildItemEntriesResult {
  entries: ItemEntry[]
  unresolved: string[]
}

/**
 * 把视觉模型返回的物品名匹配到本地物品库。
 *
 * 同一物品 + 同一 rank 只保留一张卡片，count 累加；匹配不上的名字原样返回，
 * 由界面提示用户手动搜索。
 */
export function buildItemEntries(
  items: VisionItem[],
  index: MatchIndex,
  settings: AppSettings,
): BuildItemEntriesResult {
  const byKey = new Map<string, ItemEntry>()
  const unresolved: string[] = []

  for (const visionItem of items) {
    const [best] = index.search(visionItem.name, 1)
    if (!best || best.score < SUGGEST_THRESHOLD) {
      unresolved.push(visionItem.name)
      continue
    }

    const rank = resolveItemRank(best.item, settings)
    const key = `item:${best.item.id}:${rank}`
    const count = Math.max(1, Math.floor(Number(visionItem.count) || 1))
    const existing = byKey.get(key)
    if (existing) {
      existing.count += count
      continue
    }

    byKey.set(key, {
      key,
      item: best.item,
      rank,
      count,
      state: { status: 'loading' },
      source: 'vision',
    })
  }

  return { entries: [...byKey.values()], unresolved }
}

export interface AddManualItemResult {
  entries: ItemEntry[]
  created: ItemEntry | null
}

/** 手动添加同一物品时只增加数量，不重复建卡。 */
export function addManualItem(
  entries: ItemEntry[],
  item: CatalogItem,
  settings: AppSettings,
): AddManualItemResult {
  const rank = resolveItemRank(item, settings)
  const key = `item:${item.id}:${rank}`
  const exists = entries.find((entry) => entry.key === key)
  if (exists) {
    return {
      entries: entries.map((entry) => (entry.key === key ? { ...entry, count: entry.count + 1 } : entry)),
      created: null,
    }
  }

  const created: ItemEntry = {
    key,
    item,
    rank,
    count: 1,
    state: { status: 'loading' },
    source: 'manual',
  }
  return { entries: [...entries, created], created }
}

export function addManualItems(
  entries: ItemEntry[],
  items: CatalogItem[],
  settings: AppSettings,
): AddManualItemResult[] {
  const results: AddManualItemResult[] = []
  let next = entries
  for (const item of items) {
    const result = addManualItem(next, item, settings)
    results.push(result)
    next = result.entries
  }
  return results
}
