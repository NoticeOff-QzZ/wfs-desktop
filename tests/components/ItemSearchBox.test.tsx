// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ItemSearchBox from '../../src/components/ItemSearchBox'
import { buildMatchIndex } from '../../src/lib/match'
import type { CatalogItem } from '../../src/types'

const item: CatalogItem = {
  id: 'split_chamber',
  slug: 'split_chamber',
  nameZh: '分裂膛室',
  nameEn: 'Split Chamber',
  thumb: null,
  tags: ['mod'],
  maxRank: 5,
}

const index = buildMatchIndex([item])

describe('ItemSearchBox', () => {
  it('searches and selects an item', () => {
    const onSelect = vi.fn()
    render(<ItemSearchBox index={index} onSelect={onSelect} />)

    fireEvent.change(screen.getByPlaceholderText('识别失败？直接搜物品名手动查价'), {
      target: { value: '分裂膛室' },
    })
    fireEvent.click(screen.getByText('分裂膛室'))

    expect(onSelect).toHaveBeenCalledWith(item)
    expect(screen.getByPlaceholderText('识别失败？直接搜物品名手动查价')).toHaveValue('')
  })

  it('shows nothing without a catalog index', () => {
    render(<ItemSearchBox index={null} onSelect={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('识别失败？直接搜物品名手动查价'), {
      target: { value: '分裂膛室' },
    })
    expect(screen.queryByText('分裂膛室')).not.toBeInTheDocument()
  })
})
