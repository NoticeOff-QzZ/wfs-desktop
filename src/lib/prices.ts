import type { Order, PriceQuote, QuoteState, QuoteSummary } from '../types'
import { bridge, errorMessage } from './bridge'

interface RawOrderUser {
  ingame_name?: string
  ingameName?: string
  status?: string
}

interface RawOrder {
  id?: string
  type?: string
  platinum?: number
  quantity?: number
  rank?: number
  user?: RawOrderUser
}

interface Envelope<T> {
  data?: T
}

const TTL_MS = 60_000

const cache = new Map<string, PriceQuote>()

export function mapOrder(raw: RawOrder, type: 'sell' | 'buy'): Order | null {
  if (!raw?.id || !Number.isFinite(Number(raw.platinum))) return null
  return {
    id: raw.id,
    type,
    platinum: Number(raw.platinum),
    quantity: Number.isFinite(Number(raw.quantity)) ? Number(raw.quantity) : 1,
    rank: Number.isFinite(Number(raw.rank)) ? Number(raw.rank) : undefined,
    user: raw.user
      ? {
          // v2 返回 camelCase，兼容两种写法。
          ingameName: raw.user.ingameName ?? raw.user.ingame_name ?? '',
          status: raw.user.status ?? 'offline',
        }
      : undefined,
  }
}

export function summarize(sell: Order[], buy: Order[]): QuoteSummary {
  const minSell = sell.length > 0 ? Math.min(...sell.map((order) => order.platinum)) : null
  const maxBuy = buy.length > 0 ? Math.max(...buy.map((order) => order.platinum)) : null
  return {
    minSell,
    maxBuy,
    spread: minSell !== null && maxBuy !== null ? minSell - maxBuy : null,
    sellCount: sell.length,
    buyCount: buy.length,
  }
}

export function sortOrders(sell: Order[], buy: Order[]): { sell: Order[]; buy: Order[] } {
  return {
    sell: [...sell].sort((a, b) => a.platinum - b.platinum),
    buy: [...buy].sort((a, b) => b.platinum - a.platinum),
  }
}

async function fetchTopOrders(slug: string, rank: number): Promise<PriceQuote> {
  const envelope = (await bridge.marketGet(
    `/v2/orders/item/${encodeURIComponent(slug)}/top?rank=${rank}`,
  )) as Envelope<{ sell?: RawOrder[]; buy?: RawOrder[] }>

  const rawSell = Array.isArray(envelope?.data?.sell) ? envelope.data.sell : []
  const rawBuy = Array.isArray(envelope?.data?.buy) ? envelope.data.buy : []
  const sorted = sortOrders(
    rawSell.map((order) => mapOrder(order, 'sell')).filter((order): order is Order => order !== null),
    rawBuy.map((order) => mapOrder(order, 'buy')).filter((order): order is Order => order !== null),
  )

  return {
    slug,
    rank,
    sell: sorted.sell,
    buy: sorted.buy,
    summary: summarize(sorted.sell, sorted.buy),
    fetchedAt: Date.now(),
  }
}

function errorKind(message: string): 'notFound' | 'rateLimited' | 'network' {
  if (/404|not\s*found/i.test(message)) return 'notFound'
  if (/429|509|限流|频繁/i.test(message)) return 'rateLimited'
  return 'network'
}

export function clearQuoteCache(): void {
  cache.clear()
}

export async function getQuote(
  slug: string,
  rank: number,
  options: { force?: boolean } = {},
): Promise<QuoteState> {
  const key = `${slug}|${rank}`
  const cached = cache.get(key)
  if (cached && !options.force && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.sell.length === 0 && cached.buy.length === 0
      ? { status: 'empty' }
      : { status: 'ready', quote: cached }
  }

  try {
    const quote = await fetchTopOrders(slug, rank)
    cache.set(key, quote)
    return quote.sell.length === 0 && quote.buy.length === 0
      ? { status: 'empty' }
      : { status: 'ready', quote }
  } catch (error) {
    const message = errorMessage(error)
    return { status: 'error', message, kind: errorKind(message) }
  }
}
