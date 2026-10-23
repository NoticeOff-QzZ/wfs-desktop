export type Confidence = 'high' | 'medium' | 'low'

export interface VisionItem {
  name: string
  count: number
  confidence: Confidence
}

export interface VisionRiven {
  weapon: string
  rivenName: string
  positiveTexts: string[]
  confidence: Confidence
}

export interface VisionResult {
  /** requiem / parazon / riven / normal，无法判断时为空串。 */
  family: string
  items: VisionItem[]
  rivens: VisionRiven[]
  notes: string
  raw: string
}

export interface CatalogItem {
  id: string
  slug: string
  nameZh: string | null
  nameEn: string | null
  thumb: string | null
  tags: string[]
  maxRank: number
}

export interface RivenAttribute {
  slug: string
  prefix: string | null
  suffix: string | null
  name: string
  group: string
}

export interface RivenWeapon {
  slug: string
  nameZh: string | null
  nameEn: string | null
}

export interface MatchCandidate {
  item: CatalogItem
  score: number
}

export interface OrderUser {
  ingameName: string
  status: string
}

export interface Order {
  id: string
  type: 'sell' | 'buy'
  platinum: number
  quantity: number
  rank?: number
  user?: OrderUser
}

export interface QuoteSummary {
  minSell: number | null
  maxBuy: number | null
  spread: number | null
  sellCount: number
  buyCount: number
}

export interface PriceQuote {
  slug: string
  rank: number
  sell: Order[]
  buy: Order[]
  summary: QuoteSummary
  fetchedAt: number
}

export type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: PriceQuote }
  | { status: 'empty' }
  | { status: 'error'; message: string; kind: 'notFound' | 'rateLimited' | 'network' }

export type RivenMatchMode = 'exact' | 'superset' | 'all'

export interface RivenAuction {
  id: string
  name: string
  price: number | null
  direct: boolean
  rank: number
  rerolls: number
  polarity: string
  masteryLevel: number
  positive: string[]
  negative: string[]
  values: Record<string, number>
  ownerName: string
  ownerStatus: string
}

export interface RivenPriceSummary {
  weaponSlug: string
  total: number
  mode: RivenMatchMode
  matched: number
  priced: number
  approximate: boolean
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
  examples: RivenAuction[]
  fetchedAt: number
}

export type RivenPriceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: RivenPriceSummary }
  | { status: 'error'; message: string }

export interface WeaponResolution {
  slug: string
  nameZh: string | null
  nameEn: string | null
  score: number
  certain: boolean
}

export interface CatalogSnapshot {
  schema: number
  version: string
  items: CatalogItem[]
  rivenAttributes: RivenAttribute[]
  rivenWeapons: RivenWeapon[]
  fetchedAt: number
}

export interface AppSettings {
  providerPreset: 'deepseek' | 'custom'
  baseUrl: string
  model: string
  timeoutSeconds: number
  modRank: number
  /** null 表示按物品满级。 */
  arcaneRank: number | null
  userAgent: string
}

export function itemDisplayName(item: {
  nameZh: string | null
  nameEn: string | null
  slug: string
}): string {
  return item.nameZh || item.nameEn || item.slug
}

export function assetUrl(thumb: string | null | undefined): string | null {
  if (!thumb) return null
  if (/^https?:\/\//i.test(thumb)) return thumb
  return `https://warframe.market/static/assets/${thumb.replace(/^\//, '')}`
}
