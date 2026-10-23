import type { AppSettings, CatalogItem } from '../types'

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(value)))
}

/**
 * 决定查询哪个等级的价。
 *
 * - 赋能：默认满级（设置里可改成具体等级），0 级与满级差价常有 5 倍。
 * - MOD：默认 rank 0（设置项），这是实际交易最常引用的价位。
 */
export function resolveItemRank(item: CatalogItem, settings: AppSettings): number {
  if (item.maxRank <= 0) return 0
  if (item.tags.includes('arcane_enhancement')) {
    return clamp(settings.arcaneRank ?? item.maxRank, item.maxRank)
  }
  return clamp(settings.modRank, item.maxRank)
}
