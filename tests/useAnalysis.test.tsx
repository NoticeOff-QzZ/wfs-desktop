// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalysis } from '../src/hooks/useAnalysis'
import type { LoadedCatalog } from '../src/lib/catalog'
import { buildMatchIndex } from '../src/lib/match'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import type { CatalogItem, VisionResult } from '../src/types'

const bridgeMock = vi.hoisted(() => ({
  visionRead: vi.fn(),
  logEvent: vi.fn(),
}))

const priceMock = vi.hoisted(() => ({
  getQuote: vi.fn(),
  clearQuoteCache: vi.fn(),
}))

const rivenMock = vi.hoisted(() => ({
  getRivenPrices: vi.fn(),
  clearRivenCache: vi.fn(),
}))

vi.mock('../src/lib/bridge', () => ({
  bridge: bridgeMock,
  errorMessage: (error: unknown) => String(error),
}))

vi.mock('../src/lib/prices', () => ({
  getQuote: priceMock.getQuote,
  clearQuoteCache: priceMock.clearQuoteCache,
}))

vi.mock('../src/lib/auctions', () => ({
  getRivenPrices: rivenMock.getRivenPrices,
  clearRivenCache: rivenMock.clearRivenCache,
}))

function catalogItem(id: string, nameZh: string, nameEn: string): CatalogItem {
  return { id, slug: id, nameZh, nameEn, thumb: null, tags: ['mod'], maxRank: 5 }
}

const items = [
  catalogItem('split_chamber', '分裂膛室', 'Split Chamber'),
  catalogItem('fever_strike', '热病打击', 'Fever Strike'),
]

const catalog: LoadedCatalog = {
  schema: 2,
  version: 'test',
  items,
  rivenAttributes: [],
  rivenWeapons: [{ slug: 'verglas', nameZh: '冰凇', nameEn: 'Verglas' }],
  fetchedAt: 1,
  origin: 'cache',
  index: buildMatchIndex(items),
  weaponIndex: buildMatchIndex([
    { id: 'verglas', slug: 'verglas', nameZh: '冰凇', nameEn: 'Verglas', thumb: null, tags: [], maxRank: 0 },
  ]),
  weaponBySlug: new Map([['verglas', { slug: 'verglas', nameZh: '冰凇', nameEn: 'Verglas' }]]),
}

function resultFor(name: string): VisionResult {
  return {
    family: 'normal',
    items: [{ name, count: 1, confidence: 'high' }],
    rivens: [],
    notes: '',
    raw: '',
  }
}

function rivenResultFor(weapon: string): VisionResult {
  return {
    family: 'riven',
    items: [],
    rivens: [{ weapon, rivenName: '', positiveTexts: [], confidence: 'high' }],
    notes: '',
    raw: '',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function imageFile(name: string, body: string): File {
  return new File([body], name, { type: 'image/png' })
}

function renderAnalysis(hasKey = true) {
  return renderHook((props: { hasKey: boolean }) =>
    useAnalysis({
      catalog,
      settings: DEFAULT_SETTINGS,
      hasKey: props.hasKey,
      onOpenSettings: vi.fn(),
    }),
  { initialProps: { hasKey } })
}

describe('useAnalysis image queue', () => {
  beforeEach(() => {
    bridgeMock.visionRead.mockReset()
    bridgeMock.logEvent.mockReset().mockResolvedValue(undefined)
    priceMock.getQuote.mockReset().mockResolvedValue({ status: 'empty' })
    rivenMock.getRivenPrices.mockReset().mockResolvedValue({ status: 'idle' })
  })

  it('queues images without recognizing them and caps the queue at three', async () => {
    const { result } = renderAnalysis()

    await act(async () => {
      await result.current.addFiles([
        imageFile('a.png', 'a'),
        imageFile('b.png', 'b'),
        imageFile('c.png', 'c'),
        imageFile('d.png', 'd'),
      ])
    })

    expect(result.current.images.map((image) => image.name)).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ])
    expect(result.current.notice?.kind).toBe('error')
    expect(bridgeMock.visionRead).not.toHaveBeenCalled()
  })

  it('recognizes images sequentially in queue order', async () => {
    const first = deferred<VisionResult>()
    const second = deferred<VisionResult>()
    bridgeMock.visionRead
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a'), imageFile('b.png', 'b')])
    })

    const imageOrder = result.current.images.map((image) => image.dataUrl.split(',')[1])
    let query: Promise<void> | undefined
    act(() => {
      query = result.current.startQuery()
    })

    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))
    expect(bridgeMock.visionRead.mock.calls[0]?.[0]).toBe(imageOrder[0])

    await act(async () => {
      first.resolve(resultFor('分裂膛室'))
      await Promise.resolve()
    })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(2))
    expect(bridgeMock.visionRead.mock.calls[1]?.[0]).toBe(imageOrder[1])

    await act(async () => {
      second.resolve(resultFor('热病打击'))
      await query
    })

    expect(result.current.items.map((entry) => entry.item.slug)).toEqual([
      'split_chamber',
      'fever_strike',
    ])
  })

  it('queries in the reordered queue order', async () => {
    bridgeMock.visionRead.mockResolvedValue(resultFor('分裂膛室'))
    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a'), imageFile('b.png', 'b')])
    })

    act(() => result.current.moveImage(0, 1))
    expect(result.current.images.map((image) => image.name)).toEqual(['b.png', 'a.png'])

    const firstData = result.current.images[0]?.dataUrl.split(',')[1]
    await act(async () => {
      await result.current.startQuery()
    })
    expect(bridgeMock.visionRead).toHaveBeenCalledTimes(2)
    expect(bridgeMock.visionRead.mock.calls[0]?.[0]).toBe(firstData)
  })

  it('quotes mixed items and rivens in image order', async () => {
    const quoteOrder: string[] = []
    bridgeMock.visionRead
      .mockResolvedValueOnce(rivenResultFor('冰凇'))
      .mockResolvedValueOnce(resultFor('分裂膛室'))
    priceMock.getQuote.mockImplementation(async (slug: string) => {
      quoteOrder.push(`item:${slug}`)
      return { status: 'empty' }
    })
    rivenMock.getRivenPrices.mockImplementation(async (slug: string) => {
      quoteOrder.push(`riven:${slug}`)
      return { status: 'idle' }
    })

    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('riven.png', 'riven'), imageFile('item.png', 'item')])
      await result.current.startQuery()
    })

    expect(quoteOrder).toEqual(['riven:verglas', 'item:split_chamber'])
  })

  it('removes an image before querying', async () => {
    bridgeMock.visionRead.mockResolvedValue(resultFor('分裂膛室'))
    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a'), imageFile('b.png', 'b')])
    })

    const secondData = result.current.images[1]?.dataUrl.split(',')[1]
    act(() => {
      result.current.removeImage(result.current.images[0].id)
    })
    expect(result.current.images.map((image) => image.name)).toEqual(['b.png'])

    await act(async () => {
      await result.current.startQuery()
    })
    expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1)
    expect(bridgeMock.visionRead.mock.calls[0]?.[0]).toBe(secondData)
  })

  it('cancels the queue before the next image starts', async () => {
    const first = deferred<VisionResult>()
    bridgeMock.visionRead.mockImplementationOnce(() => first.promise)
    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a'), imageFile('b.png', 'b')])
    })

    let query: Promise<void> | undefined
    act(() => {
      query = result.current.startQuery()
    })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))

    act(() => result.current.cancelQuery())
    expect(result.current.busy).toBeNull()
    expect(result.current.notice?.text).toContain('已停止查询')

    await act(async () => {
      first.resolve(resultFor('分裂膛室'))
      await query
    })

    expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1)
    expect(result.current.items).toEqual([])
    expect(result.current.busy).toBeNull()
  })

  it('does not start the next quote after cancelling during a quote', async () => {
    const firstQuote = deferred<{ status: 'empty' }>()
    bridgeMock.visionRead
      .mockResolvedValueOnce(resultFor('分裂膛室'))
      .mockResolvedValueOnce(resultFor('热病打击'))
    priceMock.getQuote.mockImplementationOnce(() => firstQuote.promise)

    const { result } = renderAnalysis()
    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a'), imageFile('b.png', 'b')])
    })

    let query: Promise<void> | undefined
    act(() => {
      query = result.current.startQuery()
    })
    await waitFor(() => expect(priceMock.getQuote).toHaveBeenCalledTimes(1))

    act(() => result.current.cancelQuery())
    await act(async () => {
      firstQuote.resolve({ status: 'empty' })
      await query
    })

    expect(priceMock.getQuote).toHaveBeenCalledTimes(1)
    expect(result.current.items.map((entry) => entry.state.status)).toEqual(['idle', 'idle'])
    expect(result.current.busy).toBeNull()
  })

  it('waits for the key before auto-starting a queued query', async () => {
    bridgeMock.visionRead.mockResolvedValue(resultFor('分裂膛室'))
    const onOpenSettings = vi.fn()
    const { result, rerender } = renderHook(
      (props: { hasKey: boolean }) =>
        useAnalysis({
          catalog,
          settings: DEFAULT_SETTINGS,
          hasKey: props.hasKey,
          onOpenSettings,
        }),
      { initialProps: { hasKey: false } },
    )

    await act(async () => {
      await result.current.addFiles([imageFile('a.png', 'a')])
      await result.current.startQuery()
    })
    expect(onOpenSettings).toHaveBeenCalled()
    expect(bridgeMock.visionRead).not.toHaveBeenCalled()

    rerender({ hasKey: true })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.item.slug)).toEqual(['split_chamber']),
    )
  })
})
