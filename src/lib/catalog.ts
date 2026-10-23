import type {
  CatalogItem,
  CatalogSnapshot,
  RivenAttribute,
  RivenWeapon,
} from '../types'
import { bridge } from './bridge'
import { buildMatchIndex, type MatchIndex } from './match'

const CACHE_KEY = 'catalog.json'
const SCHEMA = 2
const LANGUAGE = 'zh-hans'
const TTL_MS = 24 * 60 * 60 * 1000

interface RawLocalized {
  name?: string
  icon?: string
  thumb?: string
}

interface RawItem {
  id?: string
  slug?: string
  tags?: string[]
  maxRank?: number
  i18n?: Record<string, RawLocalized>
}

interface RawRivenAttribute {
  slug?: string
  group?: string
  prefix?: string
  suffix?: string
  i18n?: Record<string, RawLocalized>
}

interface RawRivenWeapon {
  slug?: string
  i18n?: Record<string, RawLocalized>
}

interface Envelope<T> {
  data?: T
  error?: { request?: string[] }
}

export function mapRawItem(raw: RawItem): CatalogItem | null {
  if (!raw.id || !raw.slug) return null
  const zh = raw.i18n?.[LANGUAGE]
  const en = raw.i18n?.en
  return {
    id: raw.id,
    slug: raw.slug,
    nameZh: zh?.name?.trim() || null,
    nameEn: en?.name?.trim() || null,
    thumb: en?.thumb ?? zh?.thumb ?? en?.icon ?? zh?.icon ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    maxRank: Number.isFinite(Number(raw.maxRank)) ? Number(raw.maxRank) : 0,
  }
}

export function mapRawRivenAttribute(raw: RawRivenAttribute): RivenAttribute | null {
  if (!raw.slug) return null
  return {
    slug: raw.slug,
    prefix: raw.prefix?.trim() || null,
    suffix: raw.suffix?.trim() || null,
    name: raw.i18n?.[LANGUAGE]?.name?.trim() || raw.i18n?.en?.name?.trim() || raw.slug,
    group: raw.group ?? 'default',
  }
}

export function mapRawRivenWeapon(raw: RawRivenWeapon): RivenWeapon | null {
  if (!raw.slug) return null
  return {
    slug: raw.slug,
    nameZh: raw.i18n?.[LANGUAGE]?.name?.trim() || null,
    nameEn: raw.i18n?.en?.name?.trim() || null,
  }
}

export interface LoadedCatalog extends CatalogSnapshot {
  origin: 'network' | 'cache'
  index: MatchIndex
  weaponIndex: MatchIndex
  weaponBySlug: Map<string, RivenWeapon>
}

function decorate(snapshot: CatalogSnapshot, origin: 'network' | 'cache'): LoadedCatalog {
  const weapons: CatalogItem[] = snapshot.rivenWeapons.map((weapon) => ({
    id: weapon.slug,
    slug: weapon.slug,
    nameZh: weapon.nameZh,
    nameEn: weapon.nameEn,
    thumb: null,
    tags: ['riven-weapon'],
    maxRank: 0,
  }))

  return {
    ...snapshot,
    origin,
    index: buildMatchIndex(snapshot.items),
    weaponIndex: buildMatchIndex(weapons),
    weaponBySlug: new Map(snapshot.rivenWeapons.map((weapon) => [weapon.slug, weapon])),
  }
}

async function readCache(): Promise<CatalogSnapshot | null> {
  try {
    const raw = await bridge.dataRead(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CatalogSnapshot
    if (
      parsed.schema === SCHEMA &&
      Array.isArray(parsed.items) &&
      parsed.items.length > 0 &&
      Array.isArray(parsed.rivenAttributes) &&
      Array.isArray(parsed.rivenWeapons)
    ) {
      return parsed
    }
  } catch {
    // 缓存损坏就当没有。
  }
  return null
}

async function getEnvelope<T>(path: string): Promise<T> {
  const envelope = (await bridge.marketGet(path)) as Envelope<T>
  if (!envelope || typeof envelope !== 'object') throw new Error(`接口返回异常：${path}`)
  if (envelope.error) throw new Error(`接口报错：${envelope.error.request?.join(', ') ?? '未知'}`)
  return envelope.data as T
}

async function fetchAll(): Promise<Omit<CatalogSnapshot, 'version' | 'fetchedAt' | 'schema'>> {
  const [rawItems, rawAttributes, rawWeapons] = await Promise.all([
    getEnvelope<RawItem[]>('/v2/items'),
    getEnvelope<RawRivenAttribute[]>('/v2/riven/attributes'),
    getEnvelope<RawRivenWeapon[]>('/v2/riven/weapons'),
  ])

  const items = (rawItems ?? []).map(mapRawItem).filter((item): item is CatalogItem => item !== null)
  if (items.length === 0) throw new Error('物品库为空')

  return {
    items,
    rivenAttributes: (rawAttributes ?? [])
      .map(mapRawRivenAttribute)
      .filter((entry): entry is RivenAttribute => entry !== null),
    rivenWeapons: (rawWeapons ?? [])
      .map(mapRawRivenWeapon)
      .filter((entry): entry is RivenWeapon => entry !== null),
  }
}

export async function loadCatalog(force = false): Promise<LoadedCatalog> {
  const cached = await readCache()

  try {
    const versionData = await getEnvelope<{ collections?: Record<string, string> }>('/v2/versions')
    const version = versionData?.collections?.items ?? ''
    if (cached && !force && cached.version === version && Date.now() - cached.fetchedAt < TTL_MS) {
      return decorate(cached, 'cache')
    }

    const fetched = await fetchAll()
    const snapshot: CatalogSnapshot = {
      schema: SCHEMA,
      version,
      ...fetched,
      fetchedAt: Date.now(),
    }
    await bridge.dataWrite(CACHE_KEY, JSON.stringify(snapshot)).catch(() => undefined)
    return decorate(snapshot, 'network')
  } catch (error) {
    if (cached) return decorate(cached, 'cache')
    throw error
  }
}
