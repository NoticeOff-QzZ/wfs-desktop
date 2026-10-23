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
  logEvent: vi.fn(() => Promise.resolve()),
}))

vi.mock('../src/lib/bridge', () => ({
  bridge: bridgeMock,
  errorMessage: (error: unknown) => String(error),
}))

vi.mock('../src/lib/prices', () => ({
  getQuote: vi.fn(() => Promise.resolve({ status: 'empty' })),
  clearQuoteCache: vi.fn(),
}))

vi.mock('../src/lib/auctions', () => ({
  getRivenPrices: vi.fn(() => Promise.resolve({ status: 'idle' })),
  clearRivenCache: vi.fn(),
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
  rivenWeapons: [],
  fetchedAt: 1,
  origin: 'cache',
  index: buildMatchIndex(items),
  weaponIndex: buildMatchIndex([]),
  weaponBySlug: new Map(),
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useAnalysis request ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a stale vision response when a newer image is pasted', async () => {
    const first = deferred<VisionResult>()
    const second = deferred<VisionResult>()
    bridgeMock.visionRead
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { result } = renderHook(() =>
      useAnalysis({
        catalog,
        settings: DEFAULT_SETTINGS,
        hasKey: true,
        onOpenSettings: vi.fn(),
      }),
    )

    let firstCall: Promise<void> | undefined
    act(() => {
      firstCall = result.current.handleFile(
        new File(['a'], 'a.png', { type: 'image/png' }),
      )
    })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))

    let secondCall: Promise<void> | undefined
    act(() => {
      secondCall = result.current.handleFile(
        new File(['b'], 'b.png', { type: 'image/png' }),
      )
    })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve(resultFor('热病打击'))
      await secondCall
    })
    expect(result.current.items.map((entry) => entry.item.slug)).toEqual(['fever_strike'])

    await act(async () => {
      first.resolve(resultFor('分裂膛室'))
      await firstCall
    })

    expect(result.current.items.map((entry) => entry.item.slug)).toEqual(['fever_strike'])
  })

  it('retries the pending image after the key is configured', async () => {
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

    act(() => {
      void result.current.handleFile(new File(['a'], 'a.png', { type: 'image/png' }))
    })
    await waitFor(() => expect(onOpenSettings).toHaveBeenCalled())
    expect(bridgeMock.visionRead).not.toHaveBeenCalled()

    rerender({ hasKey: true })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.item.slug)).toEqual(['split_chamber']),
    )
  })

  it('clears stale busy state when the newer file is rejected', async () => {
    const first = deferred<VisionResult>()
    bridgeMock.visionRead.mockImplementationOnce(() => first.promise)

    const { result } = renderHook(() =>
      useAnalysis({
        catalog,
        settings: DEFAULT_SETTINGS,
        hasKey: true,
        onOpenSettings: vi.fn(),
      }),
    )

    let firstCall: Promise<void> | undefined
    act(() => {
      firstCall = result.current.handleFile(
        new File(['a'], 'a.png', { type: 'image/png' }),
      )
    })
    await waitFor(() => expect(bridgeMock.visionRead).toHaveBeenCalledTimes(1))
    expect(result.current.busy).not.toBeNull()

    await act(async () => {
      await result.current.handleFile(
        new File(['not an image'], 'notes.txt', { type: 'text/plain' }),
      )
    })

    expect(result.current.busy).toBeNull()
    expect(result.current.notice?.kind).toBe('error')

    await act(async () => {
      first.resolve(resultFor('分裂膛室'))
      await firstCall
    })
    expect(result.current.items).toEqual([])
    expect(result.current.busy).toBeNull()
  })
})
