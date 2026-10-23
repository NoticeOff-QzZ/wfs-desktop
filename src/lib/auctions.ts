import type {
  RivenAuction,
  RivenPriceSummary,
  RivenPriceState,
} from '../types'
import { bridge, errorMessage } from './bridge'

interface RawAttribute {
  value?: number
  positive?: boolean
  url_name?: string
}

interface RawItem {
  name?: string
  type?: string
  mod_rank?: number
  re_rolls?: number
  polarity?: string
  mastery_level?: number
  attributes?: RawAttribute[]
}

interface RawAuction {
  id?: string
  starting_price?: number
  buyout_price?: number | null
  is_direct_sell?: boolean
  owner?: { ingame_name?: string; status?: string }
  item?: RawItem
}

export interface RawAuctionsResponse {
  payload?: { auctions?: RawAuction[] }
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseRivenAuctions(raw: RawAuctionsResponse | null | undefined): RivenAuction[] {
  const auctions = raw?.payload?.auctions ?? []
  const parsed: RivenAuction[] = []

  for (const entry of auctions) {
    const item = entry.item
    if (!item?.name || item.type !== 'riven') continue

    const positive: string[] = []
    const negative: string[] = []
    const values: Record<string, number> = {}

    for (const attribute of item.attributes ?? []) {
      const slug = attribute.url_name
      if (!slug) continue
      if (Number.isFinite(Number(attribute.value))) values[slug] = Number(attribute.value)
      if (attribute.positive) positive.push(slug)
      else negative.push(slug)
    }

    const direct = entry.is_direct_sell === true
    parsed.push({
      id: entry.id ?? `${item.name}-${parsed.length}`,
      name: item.name,
      price: direct
        ? positiveNumber(entry.buyout_price)
        : positiveNumber(entry.starting_price) ?? positiveNumber(entry.buyout_price),
      direct,
      rank: item.mod_rank ?? 0,
      rerolls: item.re_rolls ?? 0,
      polarity: item.polarity ?? '',
      masteryLevel: item.mastery_level ?? 0,
      positive,
      negative,
      values,
      ownerName: entry.owner?.ingame_name ?? '',
      ownerStatus: entry.owner?.status ?? 'offline',
    })
  }

  return parsed
}

export function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * fraction)),
  )
  return sorted[index]
}

/**
 * 三级降级：完全同词条 → 含这些词条且更多 → 全武器行情。
 * 只有 exact 才给价格区间，其余两种必须显式标注不等价。
 */
export function summarizeRivenAuctions(
  auctions: RivenAuction[],
  positiveStats: string[],
  weaponSlug = '',
): RivenPriceSummary {
  const wanted = [...new Set(positiveStats.map((stat) => stat.toLowerCase()))]
  const wantedKey = [...wanted].sort().join(',')

  const exact: RivenAuction[] = []
  const superset: RivenAuction[] = []

  for (const auction of auctions) {
    const have = auction.positive.map((stat) => stat.toLowerCase())
    const haveSet = new Set(have)
    if (!wanted.every((stat) => haveSet.has(stat))) continue
    superset.push(auction)
    if ([...have].sort().join(',') === wantedKey) exact.push(auction)
  }

  let mode: RivenPriceSummary['mode']
  let matched: RivenAuction[]
  if (wanted.length === 0) {
    mode = 'all'
    matched = auctions
  } else if (exact.length > 0) {
    mode = 'exact'
    matched = exact
  } else if (superset.length > 0) {
    mode = 'superset'
    matched = superset
  } else {
    mode = 'all'
    matched = auctions
  }

  const priced = matched
    .filter((auction) => auction.direct && auction.price !== null)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  const prices = priced.map((auction) => auction.price as number)

  return {
    weaponSlug,
    total: auctions.length,
    mode,
    matched: matched.length,
    priced: priced.length,
    approximate: mode !== 'exact',
    min: prices[0] ?? null,
    p25: percentile(prices, 0.25),
    median: percentile(prices, 0.5),
    p75: percentile(prices, 0.75),
    max: prices.length > 0 ? prices[prices.length - 1] : null,
    examples: priced.slice(0, 5),
    fetchedAt: Date.now(),
  }
}

const cache = new Map<string, { summary: RivenPriceSummary; at: number }>()

export function clearRivenCache(): void {
  cache.clear()
}

export async function getRivenPrices(
  weaponSlug: string,
  positiveSlugs: string[],
  options: { force?: boolean } = {},
): Promise<RivenPriceState> {
  const key = `${weaponSlug}|${[...positiveSlugs].sort().join(',')}`
  const cached = cache.get(key)
  if (cached && !options.force && Date.now() - cached.at < 60_000) {
    return { status: 'ready', summary: cached.summary }
  }

  try {
    const query = new URLSearchParams({
      type: 'riven',
      weapon_url_name: weaponSlug,
      sort_by: 'price_asc',
    })
    const raw = (await bridge.marketGet(`/v1/auctions/search?${query.toString()}`)) as RawAuctionsResponse
    const summary = summarizeRivenAuctions(parseRivenAuctions(raw), positiveSlugs, weaponSlug)
    cache.set(key, { summary, at: Date.now() })
    return { status: 'ready', summary }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}
