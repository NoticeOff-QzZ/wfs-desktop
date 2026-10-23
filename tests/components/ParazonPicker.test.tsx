// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ParazonPicker from '../../src/components/ParazonPicker'
import type { CatalogItem } from '../../src/types'

function parazon(slug: string, name: string): CatalogItem {
  return { id: slug, slug, nameZh: name, nameEn: name, thumb: null, tags: ['mod', 'parazon'], maxRank: 5 }
}

const items = [parazon('fass', 'Fass'), parazon('byteryte', '字节卫士')]

describe('ParazonPicker', () => {
  it('selects multiple cards and confirms them', () => {
    const onConfirm = vi.fn()
    render(
      <ParazonPicker items={items} open onClose={vi.fn()} onConfirm={onConfirm} />,
    )

    fireEvent.click(screen.getByTitle('Fass · fass'))
    fireEvent.click(screen.getByTitle('字节卫士 · byteryte'))
    fireEvent.click(screen.getByRole('button', { name: '加入并查价' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0].map((item: CatalogItem) => item.slug)).toEqual([
      'fass',
      'byteryte',
    ])
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<ParazonPicker items={items} open onClose={onClose} onConfirm={vi.fn()} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('filters candidates by query', () => {
    render(<ParazonPicker items={items} open onClose={vi.fn()} onConfirm={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('搜索名字（如 字节、Fass、Ris）'), {
      target: { value: '字节' },
    })

    expect(screen.queryByTitle('Fass · fass')).not.toBeInTheDocument()
    expect(screen.getByTitle('字节卫士 · byteryte')).toBeInTheDocument()
  })
})
