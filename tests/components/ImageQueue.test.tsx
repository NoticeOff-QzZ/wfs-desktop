// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ImageQueue from '../../src/components/ImageQueue'
import type { UploadedImage } from '../../src/types'

const images: UploadedImage[] = [
  { id: 'a', dataUrl: 'data:image/png;base64,YQ==', name: 'a.png', mime: 'image/png' },
  { id: 'b', dataUrl: 'data:image/png;base64,Yg==', name: 'b.png', mime: 'image/png' },
]

function dataTransfer() {
  const data = new Map<string, string>()
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  }
}

describe('ImageQueue', () => {
  it('removes the selected image', () => {
    const onRemove = vi.fn()
    render(<ImageQueue images={images} disabled={false} onRemove={onRemove} onMove={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '移除第 2 张截图' }))
    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('reorders images by drag and drop', () => {
    const onMove = vi.fn()
    render(<ImageQueue images={images} disabled={false} onRemove={vi.fn()} onMove={onMove} />)

    const transfer = dataTransfer()
    const first = screen.getByLabelText('第 1 张：a.png')
    const second = screen.getByLabelText('第 2 张：b.png')
    fireEvent.dragStart(first, { dataTransfer: transfer })
    fireEvent.dragOver(second, { dataTransfer: transfer })
    fireEvent.drop(second, { dataTransfer: transfer })

    expect(onMove).toHaveBeenCalledWith(0, 1)
  })
})
