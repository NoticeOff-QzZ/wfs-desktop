// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ItemCard from '../../src/components/ItemCard'
import type { ItemEntry } from '../../src/types'

vi.mock('../../src/lib/opener', () => ({
  openExternal: vi.fn(() => Promise.resolve()),
}))

const entry: ItemEntry = {
  key: 'item:split_chamber:0',
  item: {
    id: 'split_chamber',
    slug: 'split_chamber',
    nameZh: '分裂膛室',
    nameEn: 'Split Chamber',
    thumb: null,
    tags: ['mod'],
    maxRank: 5,
  },
  rank: 0,
  count: 3,
  source: 'vision',
  state: {
    status: 'ready',
    quote: {
      slug: 'split_chamber',
      rank: 0,
      sell: [],
      buy: [],
      summary: { minSell: 50, maxBuy: null, spread: null, sellCount: 0, buyCount: 0 },
      fetchedAt: 1,
    },
  },
}

describe('ItemCard', () => {
  it('shows quantity and the reference total', () => {
    render(<ItemCard entry={entry} onRefresh={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('×3')).toBeInTheDocument()
    expect(screen.getByText(/按最低卖价估算总价 150p/)).toBeInTheDocument()
  })
})
